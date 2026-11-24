package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * US-04 Esc. 2: cerrar la sesion en todos los dispositivos revoca todos los
 * tokens emitidos antes, sin lista negra (version de sesion en el JWT).
 */
class CerrarSesionesIT extends AbstractPostgisIT {

    private static final String PASSWORD = "secreta123";
    private static final String RUTA = "/api/auth/me/cerrar-sesiones";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    JwtService jwtService;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private Usuario cuenta(Rol rol) {
        return guardarConTerminos(Usuario.builder()
                .email("sesiones-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode(PASSWORD))
                .nombre("Ana").apellido("Ruiz").rol(rol).build());
    }

    private String login(String email) throws Exception {
        String cuerpo = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", email, "password", PASSWORD))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).get("token").asText();
    }

    private int version(String email) {
        return jdbcTemplate.queryForObject("SELECT version_sesion FROM usuario WHERE email = ?", Integer.class, email);
    }

    @Test
    void cerrarSesiones_revocaLosTokensDeTodosLosDispositivos_yUnLoginNuevoFunciona() throws Exception {
        Usuario usuario = cuenta(Rol.CIUDADANO);
        String telefono = login(usuario.getEmail());
        String laptop = login(usuario.getEmail());
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + telefono)).andExpect(status().isOk());
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + laptop)).andExpect(status().isOk());

        mockMvc.perform(post(RUTA).header("Authorization", "Bearer " + telefono))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + telefono))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + laptop))
                .andExpect(status().isUnauthorized());
        // Tambien en una ruta que exige rol, no solo en /me.
        mockMvc.perform(get("/api/reportes/mis-reportes").header("Authorization", "Bearer " + laptop))
                .andExpect(status().isUnauthorized());

        String nuevo = login(usuario.getEmail());
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + nuevo)).andExpect(status().isOk());
    }

    @Test
    void cerrarSesiones_soloAfectaALaCuentaQueLoPide() throws Exception {
        Usuario una = cuenta(Rol.CIUDADANO);
        Usuario otra = cuenta(Rol.FUNCIONARIO_MUNICIPAL);
        String tokenUna = login(una.getEmail());
        String tokenOtra = login(otra.getEmail());
        int versionOtra = version(otra.getEmail());

        mockMvc.perform(post(RUTA).header("Authorization", "Bearer " + tokenUna)).andExpect(status().isNoContent());

        assertThat(version(una.getEmail())).isEqualTo(1);
        assertThat(version(otra.getEmail())).isEqualTo(versionOtra);
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + tokenOtra)).andExpect(status().isOk());
    }

    @Test
    void cerrarSesiones_sinToken_401() throws Exception {
        mockMvc.perform(post(RUTA)).andExpect(status().isUnauthorized());
    }

    @Test
    void cerrarSesiones_conTerminosPendientes_igualSePuede() throws Exception {
        Usuario usuario = cuenta(Rol.CIUDADANO);
        String token = login(usuario.getEmail());
        jdbcTemplate.update("DELETE FROM consentimiento WHERE usuario_id = ?", usuario.getId());

        mockMvc.perform(post(RUTA).header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
    }

    @Test
    void tokenDeVersionCero_valeHastaQueSeCierranLasSesiones() throws Exception {
        // Toda cuenta empieza en la version 0 (V23). Que un token sin el claim
        // valga como la 0 lo fija JwtServiceTest.
        Usuario usuario = cuenta(Rol.CIUDADANO);
        String antiguo = jwtService.generarToken(usuario.getEmail(), usuario.getRol().name(), 0);
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + antiguo)).andExpect(status().isOk());

        mockMvc.perform(post(RUTA).header("Authorization", "Bearer " + antiguo)).andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + antiguo))
                .andExpect(status().isUnauthorized());
    }
}
