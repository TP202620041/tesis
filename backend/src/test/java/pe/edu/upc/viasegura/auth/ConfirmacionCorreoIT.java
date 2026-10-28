package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.domain.TokenConfirmacionCorreo;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.TokenConfirmacionCorreoRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.auth.service.ConfirmacionCorreoService;
import pe.edu.upc.viasegura.support.AbstractPostgisMailIT;

/**
 * Confirmacion del correo al crear la cuenta (NC-09), de punta a punta: el
 * registro sin sesion, el correo con el enlace (GreenMail), el login que
 * exige la cuenta confirmada, la confirmacion con el token del enlace y el
 * reenvio, que no permite enumerar cuentas y respeta sus topes.
 *
 * <p>El token se lee del correo, como lo haria la persona: en la base solo
 * esta su hash. En los IT el executor asincrono espera a la tarea
 * ({@code EjecutorSincronoTestConfig}), asi que al volver el {@code POST} el
 * correo ya llego; igual se espera con {@code waitForIncomingEmail}.</p>
 */
class ConfirmacionCorreoIT extends AbstractPostgisMailIT {

    private static final String PASSWORD = "secreta123";

    /** El enlace del correo: {@code <origen de la PWA>/confirmar-cuenta?token=<43 caracteres base64url>}. */
    private static final Pattern ENLACE =
            Pattern.compile("(https?://[^/\\s]+)/confirmar-cuenta\\?token=([A-Za-z0-9_-]{43})(?=\\s|$)");

    @Autowired
    MockMvc mockMvc;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    TokenConfirmacionCorreoRepository tokenRepository;
    @Autowired
    ConfirmacionCorreoService confirmacionCorreoService;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private static String correo() {
        return "nc09-" + UUID.randomUUID() + "@lima.pe";
    }

    private ResultActions registrar(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/registro")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"%s","nombre":"Rosa","apellido":"Vecina","aceptaTerminos":true,"versionTerminos":"%s"}
                        """.formatted(email, PASSWORD, versionTerminos)));
    }

    private ResultActions login(String email, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)));
    }

    private ResultActions confirmar(String token) throws Exception {
        return mockMvc.perform(post("/api/auth/confirmar-correo")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"%s\"}".formatted(token)));
    }

    private ResultActions reenviar(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/reenviar-confirmacion")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\"}".formatted(email)));
    }

    /** Los correos que llegaron a {@code email}, en orden de llegada. */
    private List<MimeMessage> correosPara(String email) throws Exception {
        List<MimeMessage> para = new ArrayList<>();
        for (MimeMessage mensaje : greenMail.getReceivedMessages()) {
            if (mensaje.getAllRecipients()[0].toString().equals(email)) {
                para.add(mensaje);
            }
        }
        return para;
    }

    /** Del texto ya decodificado: en el MIME crudo (quoted-printable) el {@code =} viaja como {@code =3D}. */
    private static Matcher enlaceDe(MimeMessage mensaje) throws Exception {
        Matcher enlace = ENLACE.matcher(((String) mensaje.getContent()).replace("\r", ""));
        assertThat(enlace.find()).as("el correo trae el enlace de confirmacion").isTrue();
        return enlace;
    }

    /** El token del ultimo correo que llego a {@code email}. */
    private String tokenDelUltimoCorreo(String email) throws Exception {
        List<MimeMessage> recibidos = correosPara(email);
        assertThat(recibidos).as("correos para " + email).isNotEmpty();
        return enlaceDe(recibidos.get(recibidos.size() - 1)).group(2);
    }

    private Usuario usuario(String email) {
        return usuarioRepository.findByEmail(email).orElseThrow();
    }

    /** Lleva al pasado los enlaces de la cuenta (el auditing fija created_at al guardar). */
    private void enlacesPedidosHace(Usuario usuario, long minutos) {
        jdbcTemplate.update("UPDATE token_confirmacion_correo SET created_at = ? WHERE usuario_id = ?",
                Timestamp.from(Instant.now().minus(minutos, ChronoUnit.MINUTES)), usuario.getId());
    }

    private long enlacesDe(Usuario usuario) {
        return tokenRepository.countByUsuarioIdAndCreatedAtAfter(usuario.getId(), Instant.EPOCH);
    }

    // ---------------------------------------------------------------- registro

    @Test
    void registro_201SinSesion_yLaCuentaQuedaSinConfirmar() throws Exception {
        String email = correo();

        registrar(email)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email", is(email)))
                .andExpect(jsonPath("$.vigenciaEnlaceHoras", is(24)))
                .andExpect(jsonPath("$.token").doesNotExist())
                .andExpect(jsonPath("$.usuario").doesNotExist());

        Usuario usuario = usuario(email);
        assertThat(usuario.isCorreoConfirmado()).isFalse();
        assertThat(usuario.getCorreoConfirmadoEn()).isNull();
    }

    @Test
    void registro_enviaElEnlace_yEnLaBaseSoloQuedaSuHash() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());

        assertThat(greenMail.waitForIncomingEmail(3000, 1)).isTrue();
        List<MimeMessage> recibidos = correosPara(email);
        assertThat(recibidos).hasSize(1);
        MimeMessage mensaje = recibidos.get(0);
        assertThat(((InternetAddress) mensaje.getFrom()[0]).getPersonal()).isEqualTo("Ciudad Viva");
        assertThat(mensaje.getSubject()).isEqualTo("Ciudad Viva: confirma tu correo");
        assertThat((String) mensaje.getContent())
                .contains("Hola, Rosa:", "Para activar tu cuenta, abre este enlace", "vence en 24 horas",
                        "Si no creaste esta cuenta, ignora este correo");

        Matcher enlace = enlaceDe(mensaje);
        String token = enlace.group(2);
        // El enlace apunta a la PWA: FRONTEND_URL o, sin ella, el primer origen de CORS.
        assertThat(enlace.group(1)).doesNotEndWith("/");

        assertThat(enlacesDe(usuario(email))).isEqualTo(1);
        TokenConfirmacionCorreo fila = tokenRepository.findByTokenHash(TokenConfirmacionCorreo.hashDe(token))
                .orElseThrow();
        assertThat(fila.getTokenHash()).doesNotContain(token);
        assertThat(fila.getUsedAt()).isNull();
        assertThat(fila.getExpiresAt())
                .isBetween(Instant.now().plus(23, ChronoUnit.HOURS), Instant.now().plus(25, ChronoUnit.HOURS));
        // El valor del token no esta en ninguna columna de la tabla.
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM token_confirmacion_correo WHERE token_hash = ?", Long.class, token))
                .isZero();
    }

    // ------------------------------------------------------------------- login

    @Test
    void login_sinConfirmar_409ConCodigoParaOfrecerReenviar() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());

        login(email, PASSWORD)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status", is(409)))
                .andExpect(jsonPath("$.codigo", is("CORREO_NO_CONFIRMADO")))
                .andExpect(jsonPath("$.message", is(ConfirmacionCorreoService.MENSAJE_CORREO_NO_CONFIRMADO)))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void login_sinConfirmarYContrasenaIncorrecta_401DeSiempre_sinRevelarNada() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());

        login(email, "incorrecta")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message", is("Credenciales inválidas")))
                .andExpect(jsonPath("$.codigo").doesNotExist());
        // Igual que una cuenta que no existe.
        login(correo(), "incorrecta")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message", is("Credenciales inválidas")))
                .andExpect(jsonPath("$.codigo").doesNotExist());
    }

    // --------------------------------------------------------------- confirmar

    @Test
    void confirmarConElEnlaceDelCorreo_204_yDespuesIniciaSesion() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        String token = tokenDelUltimoCorreo(email);

        confirmar(token)
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        Usuario usuario = usuario(email);
        assertThat(usuario.isCorreoConfirmado()).isTrue();
        assertThat(usuario.getCorreoConfirmadoEn()).isNotNull();
        login(email, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.usuario.email", is(email)));
    }

    @Test
    void confirmarDosVeces_laSegunda409YaConfirmado() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        String token = tokenDelUltimoCorreo(email);
        confirmar(token).andExpect(status().isNoContent());

        confirmar(token)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("CORREO_YA_CONFIRMADO")))
                .andExpect(jsonPath("$.message", is("Tu correo ya está confirmado. Inicia sesión con tu contraseña.")));
    }

    @Test
    void confirmarConUnEnlaceVencido_409_yLaCuentaSigueSinConfirmar() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        String token = tokenDelUltimoCorreo(email);
        jdbcTemplate.update("UPDATE token_confirmacion_correo SET expires_at = ? WHERE usuario_id = ?",
                Timestamp.from(Instant.now().minus(1, ChronoUnit.MINUTES)), usuario(email).getId());

        confirmar(token)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("CONFIRMACION_VENCIDA")))
                .andExpect(jsonPath("$.message",
                        is("El enlace de confirmación venció. Pide uno nuevo desde el inicio de sesión.")));

        assertThat(usuario(email).isCorreoConfirmado()).isFalse();
        login(email, PASSWORD).andExpect(status().isConflict());
    }

    @Test
    void confirmarConUnTokenDesconocido_409() throws Exception {
        confirmar("x".repeat(43))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("CONFIRMACION_INVALIDA")));
    }

    @Test
    void confirmarSinToken_400() throws Exception {
        mockMvc.perform(post("/api/auth/confirmar-correo")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
        confirmar("x".repeat(101)).andExpect(status().isBadRequest());
    }

    // ---------------------------------------------------------------- reenviar

    @Test
    void reenviar_anulaElEnlaceAnterior_ySoloSirveElNuevo() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        String primero = tokenDelUltimoCorreo(email);
        enlacesPedidosHace(usuario(email), 2);

        reenviar(email).andExpect(status().isAccepted());

        assertThat(greenMail.waitForIncomingEmail(3000, 2)).isTrue();
        assertThat(correosPara(email)).hasSize(2);
        String segundo = tokenDelUltimoCorreo(email);
        assertThat(segundo).isNotEqualTo(primero);

        confirmar(primero)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("CONFIRMACION_REEMPLAZADA")));
        confirmar(segundo).andExpect(status().isNoContent());
        login(email, PASSWORD).andExpect(status().isOk());
    }

    @Test
    void reenviar_respondeLoMismoExistaONoLaCuenta_ySoloEnviaALaSinConfirmar() throws Exception {
        String sinConfirmar = correo();
        registrar(sinConfirmar).andExpect(status().isCreated());
        enlacesPedidosHace(usuario(sinConfirmar), 2);
        String confirmada = correo();
        registrar(confirmada).andExpect(status().isCreated());
        confirmar(tokenDelUltimoCorreo(confirmada)).andExpect(status().isNoContent());
        enlacesPedidosHace(usuario(confirmada), 2);
        String inexistente = correo();
        int antes = greenMail.getReceivedMessages().length;

        for (String email : List.of(inexistente, confirmada, sinConfirmar)) {
            reenviar(email)
                    .andExpect(status().isAccepted())
                    .andExpect(content().string(""));
        }

        assertThat(greenMail.waitForIncomingEmail(3000, antes + 1)).isTrue();
        assertThat(greenMail.getReceivedMessages()).hasSize(antes + 1);
        assertThat(correosPara(sinConfirmar)).hasSize(2);
        assertThat(correosPara(confirmada)).hasSize(1);
        assertThat(correosPara(inexistente)).isEmpty();
        assertThat(usuarioRepository.existsByEmail(inexistente)).isFalse();
    }

    @Test
    void reenviar_unoPorMinuto_elDelRegistroCuenta() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        Usuario usuario = usuario(email);

        reenviar(email).andExpect(status().isAccepted());

        assertThat(enlacesDe(usuario)).isEqualTo(1);
        assertThat(greenMail.waitForIncomingEmail(1000, 2)).isFalse();
        assertThat(correosPara(email)).hasSize(1);
    }

    @Test
    void reenviar_topePorHora_yLosDeHaceMasDeUnaHoraNoCuentan() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        Usuario usuario = usuario(email);
        // Con el del registro, cinco enlaces en la ultima hora y ninguno en el ultimo minuto.
        for (int i = 0; i < 4; i++) {
            tokenRepository.save(TokenConfirmacionCorreo.builder()
                    .usuario(usuario)
                    .expiresAt(Instant.now().plus(1, ChronoUnit.HOURS))
                    .build());
        }
        enlacesPedidosHace(usuario, 10);
        int antes = greenMail.getReceivedMessages().length;

        reenviar(email).andExpect(status().isAccepted());
        assertThat(enlacesDe(usuario)).isEqualTo(5);
        assertThat(greenMail.getReceivedMessages()).hasSize(antes);

        enlacesPedidosHace(usuario, 61);
        reenviar(email).andExpect(status().isAccepted());
        assertThat(enlacesDe(usuario)).isEqualTo(6);
        assertThat(greenMail.waitForIncomingEmail(3000, antes + 1)).isTrue();
    }

    @Test
    void reenviar_topeDiario_yLosDeHaceMasDeUnDiaNoCuentan() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        Usuario usuario = usuario(email);
        // Con el del registro, diez enlaces en el ultimo dia y ninguno en la ultima hora.
        for (int i = 0; i < 9; i++) {
            tokenRepository.save(TokenConfirmacionCorreo.builder()
                    .usuario(usuario)
                    .expiresAt(Instant.now().plus(1, ChronoUnit.HOURS))
                    .build());
        }
        enlacesPedidosHace(usuario, 120);
        int antes = greenMail.getReceivedMessages().length;

        reenviar(email).andExpect(status().isAccepted());
        assertThat(enlacesDe(usuario)).isEqualTo(10);
        assertThat(greenMail.getReceivedMessages()).hasSize(antes);

        enlacesPedidosHace(usuario, 25 * 60);
        reenviar(email).andExpect(status().isAccepted());
        assertThat(enlacesDe(usuario)).isEqualTo(11);
        assertThat(greenMail.waitForIncomingEmail(3000, antes + 1)).isTrue();
    }

    @Test
    void emitirMensaje_soloUnaVez_yNuncaUnaFilaAnulada() throws Exception {
        // Revision del 28/10: el hash se escribe con un UPDATE condicional, asi
        // que un reenvio que anula la fila mientras el envio espera en la cola
        // gana, y la fila no se emite dos veces.
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        Usuario usuario = usuario(email);
        TokenConfirmacionCorreo pendiente = tokenRepository.save(TokenConfirmacionCorreo.builder()
                .usuario(usuario).expiresAt(Instant.now().plus(1, ChronoUnit.HOURS)).build());
        TokenConfirmacionCorreo anulada = tokenRepository.save(TokenConfirmacionCorreo.builder()
                .usuario(usuario).expiresAt(Instant.now().plus(1, ChronoUnit.HOURS)).build());
        jdbcTemplate.update("UPDATE token_confirmacion_correo SET invalidated_at = now() WHERE id = ?",
                anulada.getId());

        assertThat(confirmacionCorreoService.emitirMensaje(pendiente.getId())).isPresent();
        assertThat(confirmacionCorreoService.emitirMensaje(pendiente.getId())).isEmpty();
        assertThat(confirmacionCorreoService.emitirMensaje(anulada.getId())).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT token_hash FROM token_confirmacion_correo WHERE id = ?", String.class, anulada.getId()))
                .isNull();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT invalidated_at IS NOT NULL FROM token_confirmacion_correo WHERE id = ?", Boolean.class,
                anulada.getId())).isTrue();
    }

    @Test
    void reenviosSimultaneos_deLaMismaCuenta_creanUnSoloEnlace() throws Exception {
        String email = correo();
        registrar(email).andExpect(status().isCreated());
        Usuario usuario = usuario(email);
        enlacesPedidosHace(usuario, 2);
        int pedidos = 6;

        ExecutorService hilos = Executors.newFixedThreadPool(pedidos);
        CountDownLatch largada = new CountDownLatch(1);
        try {
            List<Future<Object>> resultados = new ArrayList<>();
            for (int i = 0; i < pedidos; i++) {
                resultados.add(hilos.submit(() -> {
                    largada.await();
                    confirmacionCorreoService.reenviar(email);
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

        // Sin el candado consultivo, cada pedido contaria cero en el ultimo minuto.
        assertThat(enlacesDe(usuario)).isEqualTo(2);
        assertThat(greenMail.waitForIncomingEmail(5000, 2)).isTrue();
        assertThat(correosPara(email)).hasSize(2);
    }

    @Test
    void reenviarConUnCorreoMalFormado_400() throws Exception {
        reenviar("no-es-correo").andExpect(status().isBadRequest());
    }
}
