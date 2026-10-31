package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
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
 *
 * <p>NC-09b: una cuenta sin confirmar no puede recuperar la contrasena. Pedir
 * el token responde como para un correo sin cuenta y un token que hubiera
 * quedado vale como uno inexistente.</p>
 */
@ExtendWith(OutputCaptureExtension.class)
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
    @Autowired
    ObjectMapper objectMapper;

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

    /**
     * NC-09b: una cuenta registrada por el API que no abrio el enlace de
     * confirmacion. Se guarda directo, sin {@code guardarConTerminos}, que la
     * daria por confirmada.
     */
    private Usuario sinConfirmar() {
        Usuario usuario = usuarioRepository.save(Usuario.builder()
                .email("sin-confirmar-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("original123"))
                .nombre("Rosa").apellido("Vecina").rol(Rol.CIUDADANO).build());
        assertThat(usuario.isCorreoConfirmado()).isFalse();
        return usuario;
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

    // ---- NC-09b: una cuenta sin confirmar no recupera la contrasena ----

    @Test
    void solicitarRecuperacion_conCuentaSinConfirmar_respondeComoUnaInexistente_sinTokenNiCorreo(
            CapturedOutput salida) throws Exception {
        Usuario usuario = sinConfirmar();

        MockHttpServletResponse sinConfirmar = solicitar(usuario.getEmail());
        MockHttpServletResponse sinCuenta = solicitar("nadie-" + UUID.randomUUID() + "@lima.pe");

        assertThat(sinConfirmar.getStatus()).isEqualTo(202).isEqualTo(sinCuenta.getStatus());
        assertThat(sinConfirmar.getContentAsString()).isEqualTo(sinCuenta.getContentAsString()).isEmpty();
        assertThat(sinConfirmar.getHeaderNames()).containsExactlyInAnyOrderElementsOf(sinCuenta.getHeaderNames());
        assertThat(tokenRepository.findAll()).isEmpty();
        assertThat(greenMail.waitForIncomingEmail(1000, 1)).isFalse();
        assertThat(greenMail.getReceivedMessages()).isEmpty();

        // Queda un INFO con el id de la cuenta y sin el correo.
        assertThat(salida.getOut().lines().filter(l -> l.contains("no confirmo su correo; no se crea token")))
                .singleElement()
                .satisfies(linea -> assertThat(linea).contains("INFO", "el usuario " + usuario.getId() + " ")
                        .doesNotContain(usuario.getEmail()));
    }

    @Test
    void restablecer_conTokenDeCuentaSinConfirmar_404ComoUnoInexistente_yNoCambiaNada() throws Exception {
        // Desde NC-09b no se crean: estos tokens serian de antes de la regla.
        Usuario usuario = sinConfirmar();
        String hashAntes = usuario.getPasswordHash();
        PasswordResetToken vigente = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario).token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plus(30, ChronoUnit.MINUTES)).build());
        PasswordResetToken vencido = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario).token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().minus(1, ChronoUnit.MINUTES)).build());

        String inexistente = mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(UUID.randomUUID().toString(), "otraClave123")))
                .andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();
        String mensajeInexistente = objectMapper.readTree(inexistente).get("message").asText();

        // El vencido tambien es 404, no el 409 de «vencio»: no se mira su estado.
        for (PasswordResetToken token : List.of(vigente, vencido)) {
            mockMvc.perform(post("/api/auth/restablecer-password")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(cuerpoRestablecer(token.getToken(), "otraClave123")))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.message").value(mensajeInexistente))
                    .andExpect(jsonPath("$.codigo").doesNotExist());
        }

        Usuario despues = usuarioRepository.findById(usuario.getId()).orElseThrow();
        assertThat(despues.getPasswordHash()).isEqualTo(hashAntes);
        assertThat(despues.isCorreoConfirmado()).as("restablecer no confirma el correo").isFalse();
        assertThat(tokenRepository.findById(vigente.getId()).orElseThrow().getUsedAt()).isNull();
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"otraClave123\"}".formatted(usuario.getEmail())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void mensajeDeRecuperacion_noSeEnviaParaUnaCuentaSinConfirmar() {
        Usuario usuario = sinConfirmar();
        PasswordResetToken vigente = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario).token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plus(30, ChronoUnit.MINUTES)).build());

        assertThat(passwordResetService.mensajeDeRecuperacion(vigente.getId())).isEmpty();
    }

    @Test
    void laCuentaSinConfirmar_recuperaLaContrasenaDespuesDeConfirmar() throws Exception {
        // El camino de la duena de un correo que otro registro: primero el
        // enlace de confirmacion (aqui, directo en la base), despues la recuperacion.
        Usuario usuario = sinConfirmar();
        solicitar(usuario.getEmail());
        assertThat(tokenRepository.findAll()).isEmpty();

        confirmarCorreo(usuario.getEmail());
        assertThat(solicitar(usuario.getEmail()).getStatus()).isEqualTo(202);

        assertThat(tokenRepository.findAll()).hasSize(1);
        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        assertThat(greenMail.getReceivedMessages()[0].getAllRecipients()[0].toString())
                .isEqualTo(usuario.getEmail());
    }

    @Test
    void restablecerConTokenInexistente_404() throws Exception {
        mockMvc.perform(post("/api/auth/restablecer-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoRestablecer(UUID.randomUUID().toString(), "otraClave123")))
                .andExpect(status().isNotFound());
    }
}
