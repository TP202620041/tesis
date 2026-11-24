package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.domain.PoliticaDeBloqueoDeLogin;
import pe.edu.upc.viasegura.auth.dto.LoginRequest;
import pe.edu.upc.viasegura.auth.service.AuthService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
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
    @Autowired
    AuthService authService;

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

    @Test
    void correoDeMasDe150Caracteres_400() throws Exception {
        // El largo de usuario.email y de la clave de intento_login.
        String largo = "a".repeat(150) + "@lima.pe";
        login(largo, PASSWORD).andExpect(status().isBadRequest());
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM intento_login", Long.class)).isZero();
    }

    // ---- Concurrencia (revision de US-02) ----

    /** Mas intentos simultaneos que conexiones tiene el pool de Hikari (10). */
    private static final int SIMULTANEOS = 25;

    /**
     * Lanza {@code SIMULTANEOS} logins a la vez, con {@code email(i)} y una
     * contrasena incorrecta, y devuelve el desenlace de cada uno: {@code 401},
     * el codigo de una {@link BusinessException} o el nombre de cualquier otra
     * excepcion (que en el API seria un 500).
     */
    private List<String> rafaga(java.util.function.IntFunction<String> email) throws Exception {
        ExecutorService hilos = Executors.newFixedThreadPool(SIMULTANEOS);
        CountDownLatch salida = new CountDownLatch(1);
        try {
            List<Future<String>> futuros = new ArrayList<>();
            for (int i = 0; i < SIMULTANEOS; i++) {
                int n = i;
                futuros.add(hilos.submit(() -> {
                    salida.await();
                    try {
                        authService.login(new LoginRequest(email.apply(n), "incorrecta-" + n));
                        return "200";
                    } catch (BadCredentialsException e) {
                        return "401";
                    } catch (BusinessException e) {
                        return e.getCodigo();
                    } catch (RuntimeException e) {
                        return e.getClass().getSimpleName();
                    }
                }));
            }
            salida.countDown();
            List<String> desenlaces = new ArrayList<>();
            for (Future<String> f : futuros) {
                desenlaces.add(f.get(60, TimeUnit.SECONDS));
            }
            return desenlaces;
        } finally {
            hilos.shutdownNow();
        }
    }

    @Test
    void rafagaSobreUnMismoCorreo_masQueElPool_pruebaSoloCincoContrasenas_ySinErrores() throws Exception {
        String email = cuentaConfirmada();

        List<String> desenlaces = rafaga(n -> email);

        // Contar y comprobar el bloqueo van en la misma sentencia: pasan 5 y
        // el resto recibe el 409, aunque lleguen todos a la vez.
        assertThat(desenlaces).filteredOn("401"::equals).hasSize(PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS);
        assertThat(desenlaces).filteredOn(PoliticaDeBloqueoDeLogin.CODIGO_BLOQUEADO::equals)
                .hasSize(SIMULTANEOS - PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS);
        login(email, PASSWORD).andExpect(status().isConflict());
    }

    @Test
    void rafagaSobreCorreosDistintos_masQueElPool_todosResponden401() throws Exception {
        String base = "rafaga-" + UUID.randomUUID();

        List<String> desenlaces = rafaga(n -> base + "-" + n + "@lima.pe");

        // Con dos conexiones por login (transaccion externa y REQUIRES_NEW
        // adentro) esta rafaga agotaba el pool y respondia 500.
        assertThat(desenlaces).containsOnly("401");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM intento_login WHERE email LIKE ?", Long.class, base + "%"))
                .isEqualTo(SIMULTANEOS);
    }
}
