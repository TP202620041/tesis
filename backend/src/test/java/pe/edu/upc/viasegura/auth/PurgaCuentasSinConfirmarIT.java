package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.mail.internet.MimeMessage;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionOperations;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.auth.service.ConfirmacionCorreoService;
import pe.edu.upc.viasegura.auth.service.PurgaCuentasSinConfirmarService;
import pe.edu.upc.viasegura.support.AbstractPostgisMailIT;

/**
 * BE-15: la purga diaria de las cuentas que nunca confirmaron su correo, contra
 * la base real. Las cuentas se crean por {@code POST /api/auth/registro} (con
 * su consentimiento y su enlace, como en produccion) y despues se llevan al
 * pasado con {@code JdbcTemplate}: el auditing fija {@code created_at} al
 * guardar.
 *
 * <p>La tarea programada esta apagada en los tests ({@code cron: "-"}); aqui
 * se llama a {@link PurgaCuentasSinConfirmarService#purgar()} directamente.
 * La base de test es compartida y {@code usuario} no se limpia, asi que cada
 * caso afirma sobre sus propias cuentas, no sobre el total de borradas.</p>
 */
@ExtendWith(OutputCaptureExtension.class)
class PurgaCuentasSinConfirmarIT extends AbstractPostgisMailIT {

    private static final String PASSWORD = "secreta123";
    private static final Pattern TOKEN = Pattern.compile("/confirmar-cuenta\\?token=([A-Za-z0-9_-]{43})");

    @Autowired
    MockMvc mockMvc;
    @Autowired
    PurgaCuentasSinConfirmarService purga;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    JdbcTemplate jdbcTemplate;
    @Autowired
    DataSource dataSource;
    @Autowired
    TransactionOperations transaccion;

    private final ExecutorService hilos = Executors.newSingleThreadExecutor();

    @AfterEach
    void cerrarHilos() {
        hilos.shutdownNow();
    }

    private static String correo() {
        return "be15-" + UUID.randomUUID() + "@lima.pe";
    }

    private ResultActions registrar(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/registro")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"%s","nombre":"Rosa","apellido":"Vecina","aceptaTerminos":true,"versionTerminos":"%s"}
                        """.formatted(email, PASSWORD, versionTerminos)));
    }

    private ResultActions reenviar(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/reenviar-confirmacion")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\"}".formatted(email)));
    }

    /** Una cuenta registrada por el API, sin confirmar, con su consentimiento y su primer enlace. */
    private Usuario registrada() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        return usuarioRepository.findByEmail(email).orElseThrow();
    }

    /**
     * Lleva la cuenta y sus enlaces {@code dias} al pasado: el primer enlace
     * (24 h de vigencia) ya vencio, como en una cuenta abandonada.
     */
    private void creadaHace(Usuario usuario, long dias) {
        Timestamp entonces = Timestamp.from(Instant.now().minus(dias, ChronoUnit.DAYS));
        jdbcTemplate.update("UPDATE usuario SET created_at = ?, updated_at = ? WHERE id = ?",
                entonces, entonces, usuario.getId());
        jdbcTemplate.update("UPDATE token_confirmacion_correo SET created_at = ?, expires_at = ? WHERE usuario_id = ?",
                entonces, Timestamp.from(entonces.toInstant().plus(Duration.ofHours(24))), usuario.getId());
    }

    private boolean existe(Usuario usuario) {
        return usuarioRepository.existsById(usuario.getId());
    }

    private long filas(String tabla, Usuario usuario) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM " + tabla + " WHERE usuario_id = ?",
                Long.class, usuario.getId());
    }

    private void tokenDeRecuperacion(Usuario usuario) {
        jdbcTemplate.update("INSERT INTO password_reset_token (usuario_id, token, expires_at, created_at)"
                        + " VALUES (?, ?, now() - interval '30 days', now() - interval '31 days')",
                usuario.getId(), UUID.randomUUID().toString());
    }

    /**
     * Solo lo que registro la purga: la salida capturada tambien trae la
     * peticion del registro (MockMvc) y GreenMail, con el correo.
     */
    private static String lineasDeLaPurga(CapturedOutput salida) {
        return salida.getOut().lines()
                .filter(linea -> linea.contains("PurgaCuentasSinConfirmarService"))
                .collect(Collectors.joining(System.lineSeparator()));
    }

    // ------------------------------------------------------------ que borra

    @Test
    void borraSoloLaCuentaSinConfirmarDeHace31Dias_conSusEnlacesTokensYConsentimientos() throws Exception {
        Usuario vencida = registrada();
        creadaHace(vencida, 31);
        tokenDeRecuperacion(vencida);

        Usuario dentroDelPlazo = registrada();
        creadaHace(dentroDelPlazo, 29);

        Usuario confirmada = registrada();
        creadaHace(confirmada, 31);
        confirmarCorreo(confirmada.getEmail());

        // Pidio un enlace nuevo con «Reenviar» hace una hora: puede usarlo.
        Usuario conEnlaceReciente = registrada();
        creadaHace(conEnlaceReciente, 31);
        reenviar(conEnlaceReciente.getEmail()).andExpect(status().isAccepted());
        jdbcTemplate.update("UPDATE token_confirmacion_correo SET created_at = now() - interval '1 hour'"
                + " WHERE usuario_id = ? AND expires_at > now()", conEnlaceReciente.getId());

        assertThat(filas("consentimiento", vencida)).isPositive();
        assertThat(filas("token_confirmacion_correo", vencida)).isPositive();
        assertThat(filas("password_reset_token", vencida)).isOne();

        int borradas = purga.purgar();

        assertThat(borradas).isGreaterThanOrEqualTo(1);
        assertThat(existe(vencida)).isFalse();
        assertThat(filas("consentimiento", vencida)).isZero();
        assertThat(filas("token_confirmacion_correo", vencida)).isZero();
        assertThat(filas("password_reset_token", vencida)).isZero();

        assertThat(existe(dentroDelPlazo)).as("sin confirmar, de hace 29 dias").isTrue();
        assertThat(existe(confirmada)).as("confirmada, de hace 31 dias").isTrue();
        assertThat(existe(conEnlaceReciente)).as("sin confirmar, con un enlace pedido hace una hora").isTrue();
        assertThat(filas("consentimiento", dentroDelPlazo)).isPositive();
        assertThat(filas("consentimiento", confirmada)).isPositive();
        assertThat(filas("consentimiento", conEnlaceReciente)).isPositive();
    }

    @Test
    void nuncaTocaAlAdminNiAUnFuncionario_aunqueEstenSinConfirmar() {
        Usuario admin = usuarioRepository.save(Usuario.builder()
                .email(correo()).passwordHash("x").nombre("Ada").apellido("Admin")
                .rol(Rol.ADMIN).correoConfirmado(false).build());
        Usuario funcionario = usuarioRepository.save(Usuario.builder()
                .email(correo()).passwordHash("x").nombre("Fito").apellido("Funcionario")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).correoConfirmado(false).build());
        creadaHace(admin, 90);
        creadaHace(funcionario, 90);

        purga.purgar();

        assertThat(existe(admin)).isTrue();
        assertThat(existe(funcionario)).isTrue();
        usuarioRepository.deleteAllById(List.of(admin.getId(), funcionario.getId()));
    }

    @Test
    void elCorreoDeLaCuentaBorradaSePuedeVolverARegistrar() throws Exception {
        Usuario vencida = registrada();
        creadaHace(vencida, 31);
        registrar(vencida.getEmail()).andExpect(status().isConflict());

        purga.purgar();

        assertThat(existe(vencida)).isFalse();
        registrar(vencida.getEmail()).andExpect(status().isCreated());
        Usuario nueva = usuarioRepository.findByEmail(vencida.getEmail()).orElseThrow();
        assertThat(nueva.getId()).isNotEqualTo(vencida.getId());
        assertThat(nueva.isCorreoConfirmado()).isFalse();
        assertThat(filas("consentimiento", nueva)).isOne();
    }

    @Test
    void esIdempotente_yRegistraCuantasBorroSinCorreos(CapturedOutput salida) throws Exception {
        Usuario vencida = registrada();
        creadaHace(vencida, 31);

        int primera = purga.purgar();
        int segunda = purga.purgar();

        assertThat(primera).isGreaterThanOrEqualTo(1);
        assertThat(segunda).isZero();
        assertThat(lineasDeLaPurga(salida))
                .contains("Purga de cuentas sin confirmar: " + primera + " cuentas borradas")
                .contains("Purga de cuentas sin confirmar: 0 cuentas borradas")
                .doesNotContain(vencida.getEmail());
    }

    // ------------------------------------------------ lo que no deberia existir

    @Test
    void conUnaFilaQueLaReferencia_noLaBorra_yDejaUnWarnConSuId(CapturedOutput salida) throws Exception {
        Usuario conSuscripcion = registrada();
        creadaHace(conSuscripcion, 31);
        jdbcTemplate.update("INSERT INTO suscripcion_push (usuario_id, endpoint, p256dh, auth, created_at, updated_at)"
                        + " VALUES (?, ?, 'p256dh', 'auth', now(), now())",
                conSuscripcion.getId(), "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID());

        purga.purgar();

        assertThat(existe(conSuscripcion)).isTrue();
        // La transaccion de la cuenta se revirtio entera: no quedo a medias.
        assertThat(filas("consentimiento", conSuscripcion)).isPositive();
        assertThat(filas("token_confirmacion_correo", conSuscripcion)).isPositive();
        assertThat(lineasDeLaPurga(salida))
                .contains("la cuenta " + conSuscripcion.getId() + " tiene datos asociados (")
                .contains("suscripcion_push")
                .doesNotContain(conSuscripcion.getEmail());

        jdbcTemplate.update("DELETE FROM suscripcion_push WHERE usuario_id = ?", conSuscripcion.getId());
    }

    @Test
    void conFotoDePerfil_noLaBorra_yDejaUnWarnConSuId(CapturedOutput salida) throws Exception {
        Usuario conFoto = registrada();
        creadaHace(conFoto, 31);
        jdbcTemplate.update("UPDATE usuario SET foto_url = ? WHERE id = ?",
                "/api/perfiles/fotos/" + UUID.randomUUID() + ".jpg", conFoto.getId());

        purga.purgar();

        assertThat(existe(conFoto)).isTrue();
        assertThat(salida.getOut())
                .contains("la cuenta " + conFoto.getId() + " tiene foto de perfil; no se borra");

        jdbcTemplate.update("UPDATE usuario SET foto_url = NULL WHERE id = ?", conFoto.getId());
    }

    @Test
    void seNiegaACorrerDentroDeOtraTransaccion() {
        assertThatThrownBy(() -> transaccion.executeWithoutResult(estado -> purga.purgar()))
                .isInstanceOf(IllegalStateException.class);
    }

    // ------------------------------------------------------------- carreras

    /** Espera a que alguna sesion de la base este esperando un candado. */
    private void esperarQueAlguienEspereUnCandado() throws InterruptedException {
        long hasta = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < hasta) {
            Long esperando = jdbcTemplate.queryForObject("SELECT count(*) FROM pg_locks WHERE NOT granted", Long.class);
            if (esperando != null && esperando > 0) {
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("nadie llego a esperar el candado");
    }

    @Test
    void siLaPersonaConfirmaMientrasCorreLaPurga_ganaLaConfirmacion() throws Exception {
        Usuario cuenta = registrada();
        creadaHace(cuenta, 31);

        try (Connection confirmacion = dataSource.getConnection()) {
            confirmacion.setAutoCommit(false);
            try (PreparedStatement confirmar = confirmacion.prepareStatement(
                    "UPDATE usuario SET correo_confirmado = TRUE, correo_confirmado_en = now() WHERE id = ?")) {
                confirmar.setLong(1, cuenta.getId());
                assertThat(confirmar.executeUpdate()).isOne();
            }
            // La purga ya tiene a la cuenta como candidata y espera su fila.
            Future<Integer> corrida = hilos.submit(purga::purgar);
            esperarQueAlguienEspereUnCandado();
            confirmacion.commit();

            corrida.get(10, TimeUnit.SECONDS);
        }

        assertThat(existe(cuenta)).isTrue();
        assertThat(usuarioRepository.findById(cuenta.getId()).orElseThrow().isCorreoConfirmado()).isTrue();
        assertThat(filas("consentimiento", cuenta)).as("conserva sus consentimientos").isPositive();
    }

    @Test
    void siLaPurgaBorraLaCuentaMientrasSeConfirma_elEnlaceDaConfirmacionInvalida() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        Usuario cuenta = usuarioRepository.findByEmail(email).orElseThrow();
        String token = tokenDelCorreo(email);

        try (Connection laPurga = dataSource.getConnection()) {
            laPurga.setAutoCommit(false);
            // Lo que hace la purga con una cuenta: el candado de su fila primero.
            try (PreparedStatement bloquear = laPurga.prepareStatement(
                    "SELECT id FROM usuario WHERE id = ? FOR UPDATE")) {
                bloquear.setLong(1, cuenta.getId());
                bloquear.executeQuery().close();
            }
            Future<MockHttpServletResponse> confirmar = hilos.submit(() -> mockMvc.perform(
                            post("/api/auth/confirmar-correo")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("{\"token\":\"%s\"}".formatted(token)))
                    .andReturn().getResponse());
            esperarQueAlguienEspereUnCandado();
            for (String borrar : new String[] {
                    "DELETE FROM token_confirmacion_correo WHERE usuario_id = ?",
                    "DELETE FROM consentimiento WHERE usuario_id = ?",
                    "DELETE FROM usuario WHERE id = ? AND correo_confirmado = FALSE"}) {
                try (PreparedStatement sentencia = laPurga.prepareStatement(borrar)) {
                    sentencia.setLong(1, cuenta.getId());
                    sentencia.executeUpdate();
                }
            }
            laPurga.commit();

            MockHttpServletResponse respuesta = confirmar.get(10, TimeUnit.SECONDS);
            assertThat(respuesta.getStatus()).isEqualTo(409);
            assertThat(respuesta.getContentAsString())
                    .contains(ConfirmacionCorreoService.CODIGO_CONFIRMACION_INVALIDA);
        }
        assertThat(existe(cuenta)).isFalse();
    }

    @Test
    void unReenvioDespuesDeLaPurga_noFallaNiCreaNada() throws Exception {
        Usuario vencida = registrada();
        creadaHace(vencida, 31);
        purga.purgar();
        assertThat(existe(vencida)).isFalse();

        reenviar(vencida.getEmail()).andExpect(status().isAccepted());

        assertThat(usuarioRepository.findByEmail(vencida.getEmail())).isEmpty();
    }

    private String tokenDelCorreo(String email) throws Exception {
        assertThat(greenMail.waitForIncomingEmail(5_000, 1)).isTrue();
        for (MimeMessage mensaje : greenMail.getReceivedMessages()) {
            if (mensaje.getAllRecipients()[0].toString().equals(email)) {
                Matcher enlace = TOKEN.matcher(((String) mensaje.getContent()).replace("\r", ""));
                if (enlace.find()) {
                    return enlace.group(1);
                }
            }
        }
        throw new AssertionError("no llego el correo de confirmacion a " + email);
    }
}
