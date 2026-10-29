package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.infra.TurnstileAdapter;
import pe.edu.upc.viasegura.auth.port.VerificadorDeCaptcha;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Registro con el {@link TurnstileAdapter} real (NC-08b), elegido por la
 * configuracion como en produccion ({@code app.captcha.tipo=turnstile}, el
 * secreto y la lista de hostnames de prod), contra un {@code siteverify}
 * local: la suite nunca llama a Cloudflare.
 *
 * <p>{@code TurnstileAdapterTest} prueba el adaptador aislado; aqui se prueba
 * el cableado: que la condicion lo elija, que lea las propiedades que
 * documenta {@code application.yml} (una clave mal escrita en un
 * {@code @Value} dejaria la lista de hostnames vacia sin avisar) y que sus
 * excepciones lleguen al ciudadano como 409 y 503.</p>
 *
 * <p>El servidor local responde segun el token: {@code aprobado} (en
 * {@code ciudadviva.app}), {@code otro-hostname} ({@code example.com}, como la
 * clave de prueba de Cloudflare), {@code rechazado}
 * ({@code timeout-or-duplicate}) y {@code caido} (500).</p>
 */
class RegistroTurnstileIT extends AbstractPostgisIT {

    private static final String SECRETO = "secreto-del-siteverify-local";
    private static final String MENSAJE_RECHAZADO =
            "No pudimos confirmar que no eres un robot. Vuelve a intentarlo.";

    private static final List<String> PEDIDOS = new CopyOnWriteArrayList<>();
    private static final HttpServer SITEVERIFY = iniciarSiteverify();

    @Autowired
    MockMvc mockMvc;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    VerificadorDeCaptcha verificadorDeCaptcha;

    @DynamicPropertySource
    static void captchaDeProduccion(DynamicPropertyRegistry registry) {
        registry.add("app.captcha.tipo", () -> "turnstile");
        registry.add("app.captcha.secret", () -> SECRETO);
        registry.add("app.captcha.turnstile.hostnames", () -> "ciudadviva.app,www.ciudadviva.app");
        registry.add("app.captcha.turnstile.url", () -> "http://127.0.0.1:" + SITEVERIFY.getAddress().getPort()
                + "/turnstile/v0/siteverify");
    }

    private static HttpServer iniciarSiteverify() {
        try {
            HttpServer servidor = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
            servidor.createContext("/turnstile/v0/siteverify", RegistroTurnstileIT::responder);
            servidor.start();
            return servidor;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void responder(HttpExchange intercambio) throws IOException {
        String cuerpo = new String(intercambio.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        PEDIDOS.add(cuerpo);
        String token = "";
        for (String par : cuerpo.split("&")) {
            if (par.startsWith("response=")) {
                token = URLDecoder.decode(par.substring("response=".length()), StandardCharsets.UTF_8);
            }
        }
        int status = 200;
        String respuesta = switch (token) {
            case "aprobado" -> "{\"success\":true,\"hostname\":\"ciudadviva.app\",\"error-codes\":[]}";
            case "otro-hostname" -> "{\"success\":true,\"hostname\":\"example.com\",\"error-codes\":[],"
                    + "\"metadata\":{\"result_with_testing_key\":true}}";
            case "rechazado" -> "{\"success\":false,\"error-codes\":[\"timeout-or-duplicate\"]}";
            case "caido" -> {
                status = 500;
                yield "<html>error</html>";
            }
            default -> "{\"success\":false,\"error-codes\":[\"invalid-input-response\"]}";
        };
        byte[] bytes = respuesta.getBytes(StandardCharsets.UTF_8);
        intercambio.getResponseHeaders().add("Content-Type",
                status == 200 ? "application/json" : "text/html");
        intercambio.sendResponseHeaders(status, bytes.length);
        try (OutputStream salida = intercambio.getResponseBody()) {
            salida.write(bytes);
        }
    }

    @AfterAll
    static void detenerSiteverify() {
        SITEVERIFY.stop(0);
    }

    @BeforeEach
    void sinPedidosPrevios() {
        PEDIDOS.clear();
    }

    private static String email() {
        return "turnstile-" + UUID.randomUUID() + "@lima.pe";
    }

    private ResultActions registrar(String email, String captchaToken) throws Exception {
        String token = captchaToken == null ? "null" : "\"" + captchaToken + "\"";
        return mockMvc.perform(post("/api/auth/registro")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"secreta123","nombre":"Ana","apellido":"Ruiz",\
                        "aceptaTerminos":true,"versionTerminos":"%s","captchaToken":%s}
                        """.formatted(email, versionTerminos, token)));
    }

    @Test
    void conCaptchaTipoTurnstile_elVerificadorEsElDeTurnstileYLoExige() {
        assertThat(verificadorDeCaptcha).isInstanceOf(TurnstileAdapter.class);
        assertThat(verificadorDeCaptcha.exigido()).isTrue();
    }

    @Test
    void tokenAprobadoEnElHostnameDeLaPwa_201YElPedidoLlevaSoloSecretYResponse() throws Exception {
        String correo = email();

        registrar(correo, "aprobado")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email", is(correo)));

        assertThat(usuarioRepository.existsByEmail(correo)).isTrue();
        assertThat(PEDIDOS).containsExactly("secret=" + SECRETO + "&response=aprobado");
    }

    @Test
    void tokenRechazado_409YNoCreaElUsuario() throws Exception {
        String correo = email();

        registrar(correo, "rechazado")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is(MENSAJE_RECHAZADO)));

        assertThat(usuarioRepository.existsByEmail(correo)).isFalse();
    }

    @Test
    void tokenAprobadoEnOtroHostname_409YNoCreaElUsuario() throws Exception {
        // La lista de prod llego al adaptador: example.com no esta en ella.
        String correo = email();

        registrar(correo, "otro-hostname")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is(MENSAJE_RECHAZADO)));

        assertThat(usuarioRepository.existsByEmail(correo)).isFalse();
    }

    @Test
    void siteverifyCaido_503YNoCreaElUsuario() throws Exception {
        String correo = email();

        registrar(correo, "caido")
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status", is(503)));

        assertThat(usuarioRepository.existsByEmail(correo)).isFalse();
    }

    @Test
    void sinToken_409SinLlamarACloudflare() throws Exception {
        registrar(email(), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is("Confirma que no eres un robot")));

        assertThat(PEDIDOS).isEmpty();
    }
}
