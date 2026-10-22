package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.icegreen.greenmail.util.GreenMailUtil;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.PasswordResetToken;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.PasswordResetTokenRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.auth.service.PasswordResetService;
import pe.edu.upc.viasegura.support.AbstractPostgisMailIT;

/**
 * Recuperacion de contrasena por token con expiracion (US-03).
 *
 * <p>Desde DEP-08 el correo sale despues del commit, en el executor asincrono
 * ({@code RecuperacionSolicitadaListener}). En los IT ese executor espera a
 * la tarea ({@code EjecutorSincronoTestConfig}), asi que al volver el
 * {@code POST} el correo ya llego a GreenMail; igual se espera con
 * {@code waitForIncomingEmail}, acotado, para no depender de eso.</p>
 */
class PasswordResetIT extends AbstractPostgisMailIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    PasswordResetTokenRepository tokenRepository;
    @Autowired
    PasswordResetService passwordResetService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void limpiarTokens() {
        // BD de test persistente y compartida entre clases: evita que tokens
        // de corridas previas contaminen los conteos de este suite.
        tokenRepository.deleteAll();
    }

    /**
     * Solo con los terminos: <b>sin</b> el consentimiento NOTIFICACIONES_CORREO,
     * a proposito (D-12): el correo de recuperacion es de seguridad y se envia siempre, asi que estos IT prueban que no depende de ese
     * permiso.
     */
    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("original123"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private String cuerpoRecuperar(String email) {
        return "{\"email\":\"%s\"}".formatted(email);
    }

    private String cuerpoRestablecer(String token, String nuevaPassword) {
        return "{\"token\":\"%s\",\"nuevaPassword\":\"%s\"}".formatted(token, nuevaPassword);
    }

    @Test
    void solicitarRecuperacion_conEmailRegistrado_enviaCorreoConToken_202() throws Exception {
        Usuario usuario = ciudadano();

        mockMvc.perform(post("/api/auth/recuperar-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRecuperar(usuario.getEmail())))
                .andExpect(status().isAccepted());

        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        MimeMessage[] recibidos = greenMail.getReceivedMessages();
        assertThat(recibidos).hasSize(1);
        assertThat(recibidos[0].getAllRecipients()[0].toString()).isEqualTo(usuario.getEmail());

        // Marca visible: nombre del remitente y prefijo del asunto.
        InternetAddress remitente = (InternetAddress) recibidos[0].getFrom()[0];
        assertThat(remitente.getPersonal()).isEqualTo("Ciudad Viva");
        assertThat(remitente.getAddress()).isEqualTo("no-reply@viasegura.pe");
        assertThat(recibidos[0].getSubject()).isEqualTo("Ciudad Viva: recuperación de contraseña");
        // QA-1 M-1: con tildes y trato de tú (el cuerpo decodificado, no el MIME crudo).
        assertThat((String) recibidos[0].getContent())
                .contains("restablecer tu contraseña", "Ingresa este token en la aplicación");

        // El token persistido es el mismo que se envio por correo.
        var tokens = tokenRepository.findAll();
        assertThat(tokens).hasSize(1);
        assertThat(GreenMailUtil.getBody(recibidos[0])).contains(tokens.get(0).getToken());
    }

    @Test
    void solicitarRecuperacion_conEmailNoRegistrado_noEnviaCorreo_peroResponde202() throws Exception {
        // Sin filtracion de que correos existen: misma respuesta, sin envio.
        mockMvc.perform(post("/api/auth/recuperar-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRecuperar("nadie-" + UUID.randomUUID() + "@lima.pe")))
                .andExpect(status().isAccepted());

        assertThat(greenMail.getReceivedMessages()).isEmpty();
        assertThat(tokenRepository.findAll()).isEmpty();
    }

    @Test
    void restablecerConTokenValido_actualizaPassword_permiteLoginConNueva_yBloqueaAntigua() throws Exception {
        Usuario usuario = ciudadano();
        mockMvc.perform(post("/api/auth/recuperar-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRecuperar(usuario.getEmail())))
                .andExpect(status().isAccepted());
        String token = tokenRepository.findAll().get(0).getToken();

        mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(token, "nuevaClave123")))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"nuevaClave123\"}"
                                .formatted(usuario.getEmail())))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"original123\"}"
                                .formatted(usuario.getEmail())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void restablecerConTokenYaUsado_409() throws Exception {
        Usuario usuario = ciudadano();
        PasswordResetToken token = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario)
                .token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plus(30, ChronoUnit.MINUTES))
                .usedAt(Instant.now().minus(1, ChronoUnit.MINUTES))
                .build());

        mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(token.getToken(), "otraClave123")))
                .andExpect(status().isConflict());
    }

    @Test
    void restablecerConTokenVencido_409() throws Exception {
        Usuario usuario = ciudadano();
        PasswordResetToken token = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario)
                .token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().minus(1, ChronoUnit.MINUTES))
                .build());

        mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(token.getToken(), "otraClave123")))
                .andExpect(status().isConflict());
    }

    // ---- DEP-08: el correo fuera de la peticion ----

    private MockHttpServletResponse solicitar(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/recuperar-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRecuperar(email)))
                .andReturn().getResponse();
    }

    @Test
    void solicitarRecuperacion_respondeIgualExistaONoLaCuenta() throws Exception {
        MockHttpServletResponse conCuenta = solicitar(ciudadano().getEmail());
        MockHttpServletResponse sinCuenta = solicitar("nadie-" + UUID.randomUUID() + "@lima.pe");

        assertThat(conCuenta.getStatus()).isEqualTo(202);
        assertThat(sinCuenta.getStatus()).isEqualTo(conCuenta.getStatus());
        assertThat(sinCuenta.getContentAsString()).isEqualTo(conCuenta.getContentAsString()).isEmpty();
        assertThat(sinCuenta.getHeaderNames()).containsExactlyInAnyOrderElementsOf(conCuenta.getHeaderNames());
    }

    @Test
    void solicitarRecuperacion_conElCorreoCaido_responde202YElTokenQuedaGuardado() throws Exception {
        // Antes de DEP-08 esto era un 500, y solo para cuentas existentes.
        Usuario usuario = ciudadano();
        greenMail.stop();

        mockMvc.perform(post("/api/auth/recuperar-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRecuperar(usuario.getEmail())))
                .andExpect(status().isAccepted());

        assertThat(tokenRepository.findAll()).hasSize(1);
        assertThat(passwordResetService.mensajeDeRecuperacion(tokenRepository.findAll().get(0).getId()))
                .hasValueSatisfying(m -> assertThat(m.para()).isEqualTo(usuario.getEmail()));
    }

    @Test
    void topePorCuenta_elCuartoPedidoDeLaHoraResponde202SinTokenNiCorreo() throws Exception {
        Usuario usuario = ciudadano();

        for (int i = 0; i < 4; i++) {
            mockMvc.perform(post("/api/auth/recuperar-password")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(cuerpoRecuperar(usuario.getEmail())))
                    .andExpect(status().isAccepted());
        }

        assertThat(tokenRepository.findAll()).hasSize(3);
        assertThat(greenMail.waitForIncomingEmail(3000, 3)).isTrue();
        assertThat(greenMail.waitForIncomingEmail(1000, 4)).isFalse();
        assertThat(greenMail.getReceivedMessages()).hasSize(3);
    }

    @Test
    void topePorCuenta_pedidosSimultaneosDeLaMismaCuenta_creanComoMaximoTres() throws Exception {
        // Sin serializar por cuenta, los seis cuentan 0 tokens antes de que
        // alguno haga commit y los seis crean el suyo.
        Usuario usuario = ciudadano();
        int pedidos = 6;
        ExecutorService hilos = Executors.newFixedThreadPool(pedidos);
        CountDownLatch largada = new CountDownLatch(1);
        try {
            List<Future<Object>> resultados = new ArrayList<>();
            for (int i = 0; i < pedidos; i++) {
                resultados.add(hilos.submit(() -> {
                    largada.await();
                    passwordResetService.solicitarRecuperacion(usuario.getEmail());
                    return null;
                }));
            }
            largada.countDown();
            for (Future<Object> resultado : resultados) {
                resultado.get(30, TimeUnit.SECONDS);
            }
        } finally {
            hilos.shutdownNow();
        }

        assertThat(tokenRepository.countByUsuarioIdAndCreatedAtAfter(
                usuario.getId(), Instant.now().minus(1, ChronoUnit.HOURS))).isEqualTo(3);
        assertThat(greenMail.waitForIncomingEmail(5000, 3)).isTrue();
        assertThat(greenMail.waitForIncomingEmail(1000, 4)).isFalse();
    }

    @Test
    void topePorCuenta_losTokensDeHaceMasDeUnaHoraNoCuentan() throws Exception {
        Usuario usuario = ciudadano();
        for (int i = 0; i < 3; i++) {
            tokenRepository.save(PasswordResetToken.builder()
                    .usuario(usuario)
                    .token(UUID.randomUUID().toString())
                    .expiresAt(Instant.now().plus(30, ChronoUnit.MINUTES))
                    .build());
        }
        // El auditing fija created_at al guardar: se lleva al pasado por SQL.
        jdbcTemplate.update("UPDATE password_reset_token SET created_at = ? WHERE usuario_id = ?",
                Timestamp.from(Instant.now().minus(2, ChronoUnit.HOURS)), usuario.getId());

        mockMvc.perform(post("/api/auth/recuperar-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRecuperar(usuario.getEmail())))
                .andExpect(status().isAccepted());

        assertThat(tokenRepository.findAll()).hasSize(4);
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
    }

    @Test
    void mensajeDeRecuperacion_soloParaUnTokenVigente() {
        Usuario usuario = ciudadano();
        PasswordResetToken vigente = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario).token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plus(30, ChronoUnit.MINUTES)).build());
        PasswordResetToken usado = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario).token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plus(30, ChronoUnit.MINUTES))
                .usedAt(Instant.now()).build());
        PasswordResetToken vencido = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario).token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().minus(1, ChronoUnit.MINUTES)).build());

        assertThat(passwordResetService.mensajeDeRecuperacion(vigente.getId())).hasValueSatisfying(m -> {
            assertThat(m.para()).isEqualTo(usuario.getEmail());
            assertThat(m.texto()).contains(vigente.getToken());
            assertThat(m.etiqueta()).isEqualTo("recuperacion");
        });
        assertThat(passwordResetService.mensajeDeRecuperacion(usado.getId())).isEmpty();
        assertThat(passwordResetService.mensajeDeRecuperacion(vencido.getId())).isEmpty();
        assertThat(passwordResetService.mensajeDeRecuperacion(-1L)).isEmpty();
    }

    @Test
    void restablecerConTokenInexistente_404() throws Exception {
        mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(UUID.randomUUID().toString(), "otraClave123")))
                .andExpect(status().isNotFound());
    }
}
