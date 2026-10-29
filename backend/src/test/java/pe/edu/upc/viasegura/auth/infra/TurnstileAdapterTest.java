package pe.edu.upc.viasegura.auth.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.SocketTimeoutException;
import java.time.Duration;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;

/**
 * Adaptador de Cloudflare Turnstile (NC-08b) sin red: {@link MockRestServiceServer}
 * atado al {@link RestClient.Builder} del adaptador. Los casos del timeout y
 * de la conexion rechazada abren un socket, pero local. Las respuestas imitan
 * las del {@code siteverify} real (comprobadas el 28/10 con las claves de
 * prueba de Cloudflare: {@code hostname} {@code example.com} y
 * {@code metadata.result_with_testing_key}).
 *
 * <p>En todos los fallos se comprueba que ni el mensaje de la excepcion (que
 * llega al ciudadano) ni el log llevan el secreto o el token.</p>
 */
@ExtendWith(OutputCaptureExtension.class)
class TurnstileAdapterTest {

    /** Inventado: con la forma de un secreto de Turnstile, pero no es uno. */
    private static final String SECRETO = "0x4AAAAAAASecretoDePruebaQueNoExiste";
    private static final String TOKEN = "0.token-del-widget-de-prueba.que-no-existe";
    private static final String HOSTNAMES_DE_PROD = "ciudadviva.app,www.ciudadviva.app";

    private static final String APROBADO_EN_CIUDADVIVA = """
            {"success": true, "challenge_ts": "2026-10-28T20:00:00.000Z", "hostname": "ciudadviva.app",
             "error-codes": [], "action": "", "cdata": ""}
            """;
    private static final String APROBADO_CON_CLAVE_DE_PRUEBA = """
            {"success": true, "challenge_ts": "2026-10-28T20:00:00.000Z", "hostname": "example.com",
             "error-codes": [], "metadata": {"result_with_testing_key": true}}
            """;

    /** Un adaptador con su servidor simulado. */
    private record ConServidor(TurnstileAdapter adaptador, MockRestServiceServer servidor) {
    }

    private static ConServidor crear(String hostnames) {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer servidor = MockRestServiceServer.bindTo(builder).build();
        return new ConServidor(new TurnstileAdapter(builder, TurnstileAdapter.URL_API, SECRETO, hostnames),
                servidor);
    }

    private static ConServidor responde(String hostnames, String cuerpo) {
        ConServidor con = crear(hostnames);
        con.servidor().expect(once(), requestTo(TurnstileAdapter.URL_API))
                .andRespond(withSuccess(cuerpo, MediaType.APPLICATION_JSON));
        return con;
    }

    @Test
    void exigido_esVerdadero() {
        assertThat(crear("").adaptador().exigido()).isTrue();
    }

    @Test
    void envia_unPostFormUrlencodedConSecretYResponseSinRemoteip() {
        ConServidor con = crear("");
        MultiValueMap<String, String> esperado = new LinkedMultiValueMap<>();
        esperado.add("secret", SECRETO);
        esperado.add("response", TOKEN);
        con.servidor().expect(once(), requestTo("https://challenges.cloudflare.com/turnstile/v0/siteverify"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
                // formData compara el formulario completo: un remoteip o un
                // idempotency_key lo harian fallar.
                .andExpect(content().formData(esperado))
                .andRespond(withSuccess(APROBADO_EN_CIUDADVIVA, MediaType.APPLICATION_JSON));

        assertThatCode(() -> con.adaptador().verificar(TOKEN)).doesNotThrowAnyException();

        con.servidor().verify();
    }

    @Test
    void sinListaDeHostnames_unaAprobacionPasaConCualquierHostname() {
        ConServidor con = responde("", APROBADO_CON_CLAVE_DE_PRUEBA);

        assertThatCode(() -> con.adaptador().verificar(TOKEN)).doesNotThrowAnyException();
    }

    @Test
    void conUnaClaveDePrueba_loAdvierteEnElLog(CapturedOutput salida) {
        responde("", APROBADO_CON_CLAVE_DE_PRUEBA).adaptador().verificar(TOKEN);

        assertThat(salida.getOut()).contains("clave secreta de prueba");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "[\"invalid-input-response\"]",
            "[\"timeout-or-duplicate\"]",
            "[\"missing-input-response\"]",
            "[\"timeout-or-duplicate\", \"invalid-input-response\"]",
            "[\"un-codigo-que-aun-no-existe\"]",
            "[]"})
    void successFalsePorElToken_es409ConElMensajeParaElCiudadano(String codigos, CapturedOutput salida) {
        ConServidor con = responde("", """
                {"success": false, "error-codes": %s, "messages": []}
                """.formatted(codigos));

        BusinessException error = catchThrowableOfType(BusinessException.class,
                () -> con.adaptador().verificar(TOKEN));

        assertThat(error).isNotNull();
        assertThat(error.getMessage()).isEqualTo("No pudimos confirmar que no eres un robot. Vuelve a intentarlo.");
        sinDatosSensibles(error, salida);
    }

    @Test
    void losCodigosDeErrorDelRechazo_vanAlLog(CapturedOutput salida) {
        ConServidor con = responde("", """
                {"success": false, "error-codes": ["timeout-or-duplicate", "invalid-input-response"]}
                """);

        assertThatThrownBy(() -> con.adaptador().verificar(TOKEN)).isInstanceOf(BusinessException.class);

        assertThat(salida.getOut()).contains("timeout-or-duplicate", "invalid-input-response");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "[\"invalid-input-secret\"]",
            "[\"missing-input-secret\"]",
            "[\"bad-request\"]",
            "[\"internal-error\"]",
            "[\"timeout-or-duplicate\", \"internal-error\"]"})
    void successFalsePorElServidor_es503(String codigos, CapturedOutput salida) {
        // No es culpa del ciudadano: un 409 «vuelve a intentarlo» no tendria remedio.
        ConServidor con = responde("", """
                {"success": false, "error-codes": %s}
                """.formatted(codigos));

        ServicioNoDisponibleException error = catchThrowableOfType(ServicioNoDisponibleException.class,
                () -> con.adaptador().verificar(TOKEN));

        assertThat(error).isNotNull();
        assertThat(error.getMessage()).isEqualTo(TurnstileAdapter.MENSAJE_NO_DISPONIBLE);
        sinDatosSensibles(error, salida);
    }

    @Test
    void losCodigosDeError_soloPasanLosQueTienenFormaDeCodigo() throws IOException {
        var respuesta = new ObjectMapper().readTree("""
                {"success": false, "error-codes": ["timeout-or-duplicate", "%s", 42, "<script>"]}
                """.formatted(TOKEN));

        assertThat(TurnstileAdapter.codigosDeError(respuesta)).containsExactly("timeout-or-duplicate");
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 401, 500, 502, 503})
    void unaRespuestaDeError_esServicioNoDisponible(int status, CapturedOutput salida) {
        ConServidor con = crear("");
        con.servidor().expect(once(), requestTo(TurnstileAdapter.URL_API))
                .andRespond(withStatus(HttpStatus.valueOf(status))
                        .contentType(MediaType.TEXT_HTML)
                        .body("<html>error</html>"));

        ServicioNoDisponibleException error = catchThrowableOfType(ServicioNoDisponibleException.class,
                () -> con.adaptador().verificar(TOKEN));

        assertThat(error).isNotNull();
        assertThat(error.getMessage()).isEqualTo(TurnstileAdapter.MENSAJE_NO_DISPONIBLE);
        sinDatosSensibles(error, salida);
    }

    @Test
    void un400ConLaClaveSecretaInvalida_es503YElCodigoVaAlLog(CapturedOutput salida) {
        // Lo que responde el siteverify real a una clave secreta invalida (28/10).
        ConServidor con = crear("");
        con.servidor().expect(once(), requestTo(TurnstileAdapter.URL_API))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error-codes\":[\"invalid-input-secret\"],\"success\":false,\"messages\":[]}"));

        ServicioNoDisponibleException error = catchThrowableOfType(ServicioNoDisponibleException.class,
                () -> con.adaptador().verificar(TOKEN));

        assertThat(error).isNotNull();
        assertThat(salida.getOut()).contains("HTTP 400", "invalid-input-secret");
        sinDatosSensibles(error, salida);
    }

    @ParameterizedTest
    @ValueSource(strings = {"<html>no es json</html>", "[]", "{\"hostname\": \"ciudadviva.app\"}",
            "{\"success\": \"true\"}", "{\"success\": 1}", "null", "{\"success\": true"})
    void unCuerpoMalFormadoOSinSuccessBooleano_esServicioNoDisponible(String cuerpo) {
        // Falla cerrado: nada que no sea un success booleano deja pasar el registro.
        ConServidor con = responde("", cuerpo);

        assertThatThrownBy(() -> con.adaptador().verificar(TOKEN))
                .isInstanceOf(ServicioNoDisponibleException.class)
                .hasMessage(TurnstileAdapter.MENSAJE_NO_DISPONIBLE);
    }

    @Test
    void unaRespuesta200SinCuerpo_esServicioNoDisponible() {
        ConServidor con = crear("");
        con.servidor().expect(once(), requestTo(TurnstileAdapter.URL_API)).andRespond(withSuccess());

        assertThatThrownBy(() -> con.adaptador().verificar(TOKEN))
                .isInstanceOf(ServicioNoDisponibleException.class);
    }

    @Test
    void sinRespuesta_esServicioNoDisponible() {
        ConServidor con = crear("");
        con.servidor().expect(once(), requestTo(TurnstileAdapter.URL_API))
                .andRespond(withException(new SocketTimeoutException("Read timed out")));

        assertThatThrownBy(() -> con.adaptador().verificar(TOKEN))
                .isInstanceOf(ServicioNoDisponibleException.class);
    }

    @Test
    void timeoutDeLecturaReal_cortaLaEsperaYEsServicioNoDisponible(CapturedOutput salida) throws IOException {
        // Un servidor que acepta la conexion (la completa el sistema operativo,
        // en la cola del socket) y nunca responde.
        try (ServerSocket mudo = new ServerSocket(0, 10, InetAddress.getLoopbackAddress())) {
            TurnstileAdapter conTimeouts = new TurnstileAdapter(
                    "http://127.0.0.1:" + mudo.getLocalPort() + "/turnstile/v0/siteverify", SECRETO, "",
                    Duration.ofSeconds(2), Duration.ofMillis(300));

            long inicio = System.nanoTime();
            ServicioNoDisponibleException error = catchThrowableOfType(ServicioNoDisponibleException.class,
                    () -> conTimeouts.verificar(TOKEN));
            Duration espera = Duration.ofNanos(System.nanoTime() - inicio);

            assertThat(error).isNotNull();
            assertThat(espera).isLessThan(Duration.ofSeconds(5));
            sinDatosSensibles(error, salida);
        }
    }

    @Test
    void conexionRechazada_esServicioNoDisponible() throws IOException {
        int puertoCerrado;
        try (ServerSocket libre = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            puertoCerrado = libre.getLocalPort();
        }
        TurnstileAdapter sinServidor = new TurnstileAdapter(
                "http://127.0.0.1:" + puertoCerrado + "/turnstile/v0/siteverify", SECRETO, "",
                Duration.ofSeconds(2), Duration.ofSeconds(2));

        assertThatThrownBy(() -> sinServidor.verificar(TOKEN)).isInstanceOf(ServicioNoDisponibleException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " "})
    void sinSecreto_noArrancaYNombraLaVariable(String secreto) {
        assertThatThrownBy(() -> new TurnstileAdapter(RestClient.builder(), TurnstileAdapter.URL_API, secreto, ""))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CAPTCHA_SECRET");
    }

    @Test
    void sinCaptchaAdapter_noExigeNiVerifica() {
        SinCaptchaAdapter sin = new SinCaptchaAdapter();

        assertThat(sin.exigido()).isFalse();
        assertThatCode(() -> sin.verificar(null)).doesNotThrowAnyException();
    }

    /** El hostname de la respuesta contra {@code CAPTCHA_HOSTNAMES}. */
    @Nested
    class Hostname {

        @ParameterizedTest
        @ValueSource(strings = {"ciudadviva.app", "www.ciudadviva.app", "WWW.CiudadViva.app"})
        void unHostnameDeLaLista_pasa(String hostname) {
            ConServidor con = responde(HOSTNAMES_DE_PROD, """
                    {"success": true, "hostname": "%s", "error-codes": []}
                    """.formatted(hostname));

            assertThatCode(() -> con.adaptador().verificar(TOKEN)).doesNotThrowAnyException();
        }

        @ParameterizedTest
        @ValueSource(strings = {"example.com", "ciudadviva.app.evil.com", "evilciudadviva.app",
                "app.ciudadviva.app", "localhost", "", "ciudadviva.app."})
        void otroHostname_es409ConElMensajeDelRechazo(String hostname, CapturedOutput salida) {
            ConServidor con = responde(HOSTNAMES_DE_PROD, """
                    {"success": true, "hostname": "%s", "error-codes": []}
                    """.formatted(hostname));

            BusinessException error = catchThrowableOfType(BusinessException.class,
                    () -> con.adaptador().verificar(TOKEN));

            assertThat(error).isNotNull();
            assertThat(error.getMessage()).isEqualTo(TurnstileAdapter.MENSAJE_RECHAZADO);
            sinDatosSensibles(error, salida);
        }

        @Test
        void unaClaveDePruebaEnProduccion_noPasaYElLogLoDice(CapturedOutput salida) {
            // Las claves secretas de prueba aprueban cualquier token con example.com.
            ConServidor con = responde(HOSTNAMES_DE_PROD, APROBADO_CON_CLAVE_DE_PRUEBA);

            assertThatThrownBy(() -> con.adaptador().verificar(TOKEN)).isInstanceOf(BusinessException.class);

            assertThat(salida.getOut()).contains("example.com", "clave secreta es una de prueba");
        }

        @Test
        void unHostnameSinFormaDeHostname_noLlegaTalCualAlLog(CapturedOutput salida) {
            ConServidor con = responde(HOSTNAMES_DE_PROD, """
                    {"success": true, "hostname": "evil.com\\nINFO falso", "error-codes": []}
                    """);

            assertThatThrownBy(() -> con.adaptador().verificar(TOKEN)).isInstanceOf(BusinessException.class);

            assertThat(salida.getOut()).doesNotContain("falso").contains("<no es un hostname>");
        }

        @ParameterizedTest
        @ValueSource(strings = {"{\"success\": true}", "{\"success\": true, \"hostname\": null}",
                "{\"success\": true, \"hostname\": 42}"})
        void unaAprobacionSinHostname_es503(String cuerpo) {
            ConServidor con = responde(HOSTNAMES_DE_PROD, cuerpo);

            assertThatThrownBy(() -> con.adaptador().verificar(TOKEN))
                    .isInstanceOf(ServicioNoDisponibleException.class)
                    .hasMessage(TurnstileAdapter.MENSAJE_NO_DISPONIBLE);
        }

        @Test
        void unRechazoConHostnameDeLaLista_sigueSiendo409() {
            ConServidor con = responde(HOSTNAMES_DE_PROD, """
                    {"success": false, "hostname": "ciudadviva.app", "error-codes": ["timeout-or-duplicate"]}
                    """);

            assertThatThrownBy(() -> con.adaptador().verificar(TOKEN)).isInstanceOf(BusinessException.class);
        }

        @Test
        void laLista_seRecortaPasaAMinusculasYDescartaVacios() {
            assertThat(TurnstileAdapter.hostnamesPermitidos(" ciudadviva.app , WWW.CiudadViva.app ,, "))
                    .containsExactly("ciudadviva.app", "www.ciudadviva.app");
            assertThat(TurnstileAdapter.hostnamesPermitidos("")).isEmpty();
            assertThat(TurnstileAdapter.hostnamesPermitidos(" , ")).isEmpty();
            assertThat(TurnstileAdapter.hostnamesPermitidos(null)).isEmpty();
        }

        @ParameterizedTest
        @ValueSource(strings = {"https://ciudadviva.app", "ciudadviva.app:443", "ciudadviva.app/registro",
                "*.ciudadviva.app", "ciudad viva.app", "-ciudadviva.app", "ciudadviva..app"})
        void unaEntradaQueNoEsHostname_noArrancaYNombraLaVariable(String entrada) {
            assertThatThrownBy(() -> new TurnstileAdapter(RestClient.builder(), TurnstileAdapter.URL_API, SECRETO,
                    "www.ciudadviva.app," + entrada))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("CAPTCHA_HOSTNAMES")
                    .hasMessageContaining("'" + entrada + "'");
        }
    }

    private static void sinDatosSensibles(RuntimeException error, CapturedOutput salida) {
        assertThat(error.getMessage()).doesNotContain(SECRETO, TOKEN);
        assertThat(salida.getAll()).doesNotContain(SECRETO, TOKEN);
    }
}
