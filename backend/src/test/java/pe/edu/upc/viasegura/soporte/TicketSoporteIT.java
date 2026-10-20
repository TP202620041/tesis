package pe.edu.upc.viasegura.soporte;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
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
import pe.edu.upc.viasegura.soporte.domain.EstadoTicket;
import pe.edu.upc.viasegura.soporte.domain.TicketSoporte;
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

    /**
     * Solo con los terminos: <b>sin</b> el consentimiento NOTIFICACIONES_CORREO,
     * a proposito (D-12): la respuesta de soporte la pidio el usuario y se envia siempre, asi que estos IT prueban que no depende de ese
     * permiso.
     */
    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private Usuario funcionario() {
        return guardarConTerminos(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal").rol(Rol.FUNCIONARIO_MUNICIPAL).build());
    }

    private Usuario admin() {
        return guardarConTerminos(Usuario.builder()
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

    // ---- US-25: listado del ADMIN ----

    private TicketSoporte ticket(Usuario autor, String asunto, EstadoTicket estado) {
        return ticketRepository.save(TicketSoporte.builder()
                .usuario(autor)
                .emailContacto(autor.getEmail())
                .asunto(asunto)
                .mensaje("Mensaje de " + asunto)
                .estado(estado)
                .build());
    }

    @Test
    void adminListaTodos_masRecientesPrimero_conAutorYContacto() throws Exception {
        Usuario ciu = ciudadano();
        Usuario func = funcionario();
        ticket(ciu, "Primero", EstadoTicket.ABIERTO);
        ticket(func, "Segundo", EstadoTicket.EN_PROCESO);
        TicketSoporte tercero = ticket(ciu, "Tercero", EstadoTicket.CERRADO);

        mockMvc.perform(get("/api/soporte/tickets")
                        .header("Authorization", "Bearer " + token(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(3)))
                .andExpect(jsonPath("$.content[0].id", is(tercero.getId().intValue())))
                .andExpect(jsonPath("$.content[0].asunto", is("Tercero")))
                .andExpect(jsonPath("$.content[0].mensaje", is("Mensaje de Tercero")))
                .andExpect(jsonPath("$.content[0].estado", is("CERRADO")))
                .andExpect(jsonPath("$.content[0].respuesta", nullValue()))
                .andExpect(jsonPath("$.content[0].emailContacto", is(ciu.getEmail())))
                .andExpect(jsonPath("$.content[0].nombreAutor", is("Ana Vecina")))
                .andExpect(jsonPath("$.content[0].createdAt", notNullValue()))
                .andExpect(jsonPath("$.content[0].updatedAt", notNullValue()))
                .andExpect(jsonPath("$.content[1].asunto", is("Segundo")))
                .andExpect(jsonPath("$.content[1].nombreAutor", is("Fabi Municipal")))
                .andExpect(jsonPath("$.content[2].asunto", is("Primero")));
    }

    @Test
    void adminFiltraPorEstado() throws Exception {
        Usuario ciu = ciudadano();
        ticket(ciu, "Abierto 1", EstadoTicket.ABIERTO);
        ticket(ciu, "Cerrado", EstadoTicket.CERRADO);
        ticket(ciu, "Abierto 2", EstadoTicket.ABIERTO);

        mockMvc.perform(get("/api/soporte/tickets").param("estado", "ABIERTO")
                        .header("Authorization", "Bearer " + token(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(2)))
                .andExpect(jsonPath("$.content[0].asunto", is("Abierto 2")))
                .andExpect(jsonPath("$.content[1].asunto", is("Abierto 1")));

        mockMvc.perform(get("/api/soporte/tickets").param("estado", "EN_PROCESO")
                        .header("Authorization", "Bearer " + token(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(0)));
    }

    @Test
    void adminPagina() throws Exception {
        Usuario ciu = ciudadano();
        ticket(ciu, "T1", EstadoTicket.ABIERTO);
        ticket(ciu, "T2", EstadoTicket.ABIERTO);
        ticket(ciu, "T3", EstadoTicket.ABIERTO);

        mockMvc.perform(get("/api/soporte/tickets").param("page", "1").param("size", "2")
                        .header("Authorization", "Bearer " + token(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(3)))
                .andExpect(jsonPath("$.totalPages", is(2)))
                .andExpect(jsonPath("$.content.length()", is(1)))
                .andExpect(jsonPath("$.content[0].asunto", is("T1")));
    }

    @Test
    void adminConSizeFueraDeRango_400() throws Exception {
        mockMvc.perform(get("/api/soporte/tickets").param("size", "0")
                        .header("Authorization", "Bearer " + token(admin())))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/soporte/tickets").param("size", "101")
                        .header("Authorization", "Bearer " + token(admin())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminConPageNegativa_400() throws Exception {
        mockMvc.perform(get("/api/soporte/tickets").param("page", "-1")
                        .header("Authorization", "Bearer " + token(admin())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listadoAdmin_ciudadanoYFuncionario_403() throws Exception {
        mockMvc.perform(get("/api/soporte/tickets")
                        .header("Authorization", "Bearer " + token(ciudadano())))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/soporte/tickets")
                        .header("Authorization", "Bearer " + token(funcionario())))
                .andExpect(status().isForbidden());
    }

    @Test
    void listadoAdmin_sinToken_401() throws Exception {
        mockMvc.perform(get("/api/soporte/tickets"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void misTicketsSigueFuncionandoJuntoAlListadoAdmin() throws Exception {
        // La ruta literal /mis-tickets no la captura el GET de la raiz.
        Usuario ciu = ciudadano();
        ticket(ciu, "Propio", EstadoTicket.ABIERTO);
        mockMvc.perform(get("/api/soporte/tickets/mis-tickets")
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].asunto", is("Propio")))
                .andExpect(jsonPath("$[0].emailContacto").doesNotExist());
    }

    @Test
    void crearTicketSinToken_401() throws Exception {
        mockMvc.perform(post("/api/soporte/tickets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoCrear("x", "y")))
                .andExpect(status().isUnauthorized());
    }
}
