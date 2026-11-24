package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.domain.PoliticaDeBloqueoDeLogin;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * US-02 Esc. 2: bloqueo temporal tras {@value PoliticaDeBloqueoDeLogin#INTENTOS_MAXIMOS}
 * intentos fallidos seguidos, sin revelar si el correo tiene cuenta.
 */
class BloqueoLoginIT extends AbstractPostgisIT {

    private static final String PASSWORD = "secreta123";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private String cuentaConfirmada() throws Exception {
        String email = "bloqueo-" + UUID.randomUUID() + "@lima.pe";
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email, "password", PASSWORD, "nombre", "Ana", "apellido", "Ruiz",
                                "aceptaTerminos", true, "versionTerminos", versionTerminos))))
                .andExpect(status().isCreated());
        confirmarCorreo(email);
        return email;
    }

    private ResultActions login(String email, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email, "password", password))));
    }

    private void fallar(String email, int veces) throws Exception {
        for (int i = 0; i < veces; i++) {
            login(email, "incorrecta-" + i).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void quintoFallo_bloquea_yNiLaContrasenaCorrectaEntra() throws Exception {
        String email = cuentaConfirmada();
        fallar(email, PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS);

        login(email, PASSWORD)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is(PoliticaDeBloqueoDeLogin.CODIGO_BLOQUEADO)))
                .andExpect(jsonPath("$.message", is(PoliticaDeBloqueoDeLogin.mensaje(15))));
        // Otro intento fallido durante el bloqueo tampoco llega a la contrasena.
        login(email, "otra-incorrecta").andExpect(status().isConflict());
    }

    @Test
    void cuatroFallos_noBloquean() throws Exception {
        String email = cuentaConfirmada();
        fallar(email, PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS - 1);

        login(email, PASSWORD).andExpect(status().isOk());
    }

    @Test
    void correoSinCuenta_seBloqueaIgual_conLaMismaRespuesta() throws Exception {
        String conCuenta = cuentaConfirmada();
        String sinCuenta = "nadie-" + UUID.randomUUID() + "@lima.pe";
        fallar(conCuenta, PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS);
        fallar(sinCuenta, PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS);

        String respuestaConCuenta = login(conCuenta, PASSWORD)
                .andExpect(status().isConflict())
                .andReturn().getResponse().getContentAsString();
        String respuestaSinCuenta = login(sinCuenta, PASSWORD)
                .andExpect(status().isConflict())
                .andReturn().getResponse().getContentAsString();

        assertThat(objectMapper.readTree(respuestaSinCuenta).get("message"))
                .isEqualTo(objectMapper.readTree(respuestaConCuenta).get("message"));
        assertThat(objectMapper.readTree(respuestaSinCuenta).get("codigo"))
                .isEqualTo(objectMapper.readTree(respuestaConCuenta).get("codigo"));
    }

    @Test
    void loginCorrecto_reiniciaElContador() throws Exception {
        String email = cuentaConfirmada();
        fallar(email, PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS - 1);
        login(email, PASSWORD).andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM intento_login WHERE email = ?", Long.class, email)).isZero();

        fallar(email, PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS - 1);
        login(email, PASSWORD).andExpect(status().isOk());
    }

    @Test
    void bloqueoVencido_permiteEntrar_yVuelveAContarDesdeCero() throws Exception {
        String email = cuentaConfirmada();
        fallar(email, PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS);
        jdbcTemplate.update("UPDATE intento_login SET bloqueado_hasta = now() - interval '1 minute', "
                + "ultimo_fallo = now() - interval '16 minutes' WHERE email = ?", email);

        // Un fallo despues del bloqueo vencido cuenta como el primero.
        login(email, "incorrecta").andExpect(status().isUnauthorized());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT fallidos FROM intento_login WHERE email = ?", Integer.class, email)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT bloqueado_hasta IS NULL FROM intento_login WHERE email = ?", Boolean.class, email)).isTrue();

        login(email, PASSWORD).andExpect(status().isOk());
    }

    @Test
    void elContador_noDistingueMayusculas() throws Exception {
        String email = cuentaConfirmada();
        fallar(email.toUpperCase(), PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS);

        login(email, PASSWORD).andExpect(status().isConflict());
    }
}
