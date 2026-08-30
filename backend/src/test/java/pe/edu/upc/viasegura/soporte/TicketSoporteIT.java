package pe.edu.upc.viasegura.soporte;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.soporte.repository.TicketSoporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisMailIT;

/** Consultas de soporte tecnico (US-25). */
class TicketSoporteIT extends AbstractPostgisMailIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    TicketSoporteRepository ticketRepository;
    @Autowired
    ObjectMapper objectMapper;

    @BeforeEach
    void limpiarTickets() {
        ticketRepository.deleteAll();
    }

    private Usuario ciudadano() {
        return usuarioRepository.save(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private Usuario funcionario() {
        return usuarioRepository.save(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal").rol(Rol.FUNCIONARIO_MUNICIPAL).build());
    }

    private Usuario admin() {
        return usuarioRepository.save(Usuario.builder()
                .email("admin-" + UUID.randomUUID() + "@viasegura.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Admin").apellido("Plataforma").rol(Rol.ADMIN).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private String cuerpoCrear(String asunto, String mensaje) {
        return "{\"asunto\":\"%s\",\"mensaje\":\"%s\"}".formatted(asunto, mensaje);
    }

    @Test
    void ciudadanoCreaTicket_201_estadoAbiertoSinRespuesta() throws Exception {
        Usuario ciu = ciudadano();

        mockMvc.perform(post("/api/soporte/tickets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoCrear("No puedo subir foto", "El boton no responde"))
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.estado", is("ABIERTO")))
                .andExpect(jsonPath("$.respuesta", nullValue()));
    }

    @Test
    void funcionarioTambienPuedeCrearTicket_201() throws Exception {
        // El backlog dice "Como usuario" sin restringir el rol.
        mockMvc.perform(post("/api/soporte/tickets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoCrear("Duda sobre bandeja", "No veo reportes RECHAZADOS"))
                        .header("Authorization", "Bearer " + token(funcionario())))
                .andExpect(status().isCreated());
    }

    @Test
    void misTickets_devuelveSoloLosPropios() throws Exception {
        Usuario ciu1 = ciudadano();
        Usuario ciu2 = ciudadano();
        mockMvc.perform(post("/api/soporte/tickets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoCrear("Ticket de ciu1", "mensaje"))
                        .header("Authorization", "Bearer " + token(ciu1)))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/soporte/tickets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoCrear("Ticket de ciu2", "mensaje"))
                        .header("Authorization", "Bearer " + token(ciu2)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/soporte/tickets/mis-tickets")
                        .header("Authorization", "Bearer " + token(ciu1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()", is(1)))
                .andExpect(jsonPath("$[0].asunto", is("Ticket de ciu1")));
    }

    @Test
    void adminResponde_persisteRespuesta_yEnviaCorreo() throws Exception {
        Usuario ciu = ciudadano();
        String cuerpo = mockMvc.perform(post("/api/soporte/tickets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoCrear("Consulta", "Ayuda por favor"))
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long ticketId = objectMapper.readTree(cuerpo).path("id").asLong();

        mockMvc.perform(patch("/api/soporte/tickets/{id}/responder", ticketId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"respuesta\":\"Prueba con otro navegador\",\"estado\":\"CERRADO\"}")
                        .header("Authorization", "Bearer " + token(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado", is("CERRADO")))
                .andExpect(jsonPath("$.respuesta", is("Prueba con otro navegador")));

        // Visible para el ciudadano via GET.
        mockMvc.perform(get("/api/soporte/tickets/mis-tickets")
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].respuesta", is("Prueba con otro navegador")));

        // Y llego el correo real (US-25 Esc.2).
        Assertions.assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        Assertions.assertThat(greenMail.getReceivedMessages()[0].getAllRecipients()[0].toString())
                .isEqualTo(ciu.getEmail());
    }

    @Test
    void noAdminIntentaResponder_403() throws Exception {
        Usuario ciu = ciudadano();
        String cuerpo = mockMvc.perform(post("/api/soporte/tickets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoCrear("Consulta", "Ayuda"))
                        .header("Authorization", "Bearer " + token(ciu)))
                .andReturn().getResponse().getContentAsString();
        long ticketId = objectMapper.readTree(cuerpo).path("id").asLong();

        mockMvc.perform(patch("/api/soporte/tickets/{id}/responder", ticketId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"respuesta\":\"No deberia poder\",\"estado\":\"CERRADO\"}")
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isForbidden());
    }

    @Test
    void responderTicketInexistente_404() throws Exception {
        mockMvc.perform(patch("/api/soporte/tickets/{id}/responder", 999_999L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"respuesta\":\"x\",\"estado\":\"CERRADO\"}")
                        .header("Authorization", "Bearer " + token(admin())))
                .andExpect(status().isNotFound());
    }

    @Test
    void crearTicketSinToken_401() throws Exception {
        mockMvc.perform(post("/api/soporte/tickets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoCrear("x", "y")))
                .andExpect(status().isUnauthorized());
    }
}
