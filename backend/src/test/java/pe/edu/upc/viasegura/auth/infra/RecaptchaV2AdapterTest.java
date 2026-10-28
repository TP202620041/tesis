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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
 * Adaptador de reCAPTCHA v2 (NC-08) sin red: {@link MockRestServiceServer}
 * atado al {@link RestClient.Builder} del adaptador. Los casos del timeout y
 * de la conexion rechazada abren un socket, pero local.
 *
 * <p>En todos los fallos se comprueba que el mensaje de la excepcion (que
 * llega al ciudadano y al log) no lleva el secreto ni el token.</p>
 */
class RecaptchaV2AdapterTest {

    /** Inventado: con la forma de un secreto de reCAPTCHA, pero no es uno. */
    private static final String SECRETO = "6LeSecretoDePruebaQueNoExiste_0000000000";
    private static final String TOKEN = "03AFcWeA-token-de-la-casilla-de-prueba";

    private MockRestServiceServer servidor;
    private RecaptchaV2Adapter adaptador;

    @BeforeEach
    void crear() {
        RestClient.Builder builder = RestClient.builder();
        servidor = MockRestServiceServer.bindTo(builder).build();
        adaptador = new RecaptchaV2Adapter(builder, RecaptchaV2Adapter.URL_API, SECRETO);
    }

    @Test
    void exigido_esVerdadero() {
        assertThat(adaptador.exigido()).isTrue();
    }

    @Test
    void envia_unPostFormUrlencodedConSecretYResponseSinRemoteip() {
        MultiValueMap<String, String> esperado = new LinkedMultiValueMap<>();
        esperado.add("secret", SECRETO);
        esperado.add("response", TOKEN);
        servidor.expect(once(), requestTo("https://www.google.com/recaptcha/api/siteverify"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
                // formData compara el formulario completo: un remoteip lo haria fallar.
                .andExpect(content().formData(esperado))
                .andRespond(withSuccess("{\"success\": true, \"hostname\": \"localhost\"}",
                        MediaType.APPLICATION_JSON));

        assertThatCode(() -> adaptador.verificar(TOKEN)).doesNotThrowAnyException();

        servidor.verify();
    }

    @Test
    void successFalse_esBusinessExceptionConMensajeParaElCiudadano() {
        servidor.expect(once(), requestTo(RecaptchaV2Adapter.URL_API))
                .andRespond(withSuccess("""
                        {"success": false, "error-codes": ["timeout-or-duplicate", "invalid-input-response"]}
                        """, MediaType.APPLICATION_JSON));

        BusinessException error = catchThrowableOfType(BusinessException.class, () -> adaptador.verificar(TOKEN));

        assertThat(error).isNotNull();
        assertThat(error.getMessage()).isEqualTo("No pudimos confirmar que no eres un robot. Vuelve a intentarlo.");
        sinDatosSensibles(error);
    }

    @Test
    void losCodigosDeError_soloPasanLosQueTienenFormaDeCodigo() throws IOException {
        var respuesta = new ObjectMapper().readTree("""
                {"success": false, "error-codes": ["timeout-or-duplicate", "%s", 42, "<script>"]}
                """.formatted(TOKEN));

        assertThat(RecaptchaV2Adapter.codigosDeError(respuesta)).containsExactly("timeout-or-duplicate");
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 500, 502, 503})
    void unaRespuestaDeError_esServicioNoDisponible(int status) {
        servidor.expect(once(), requestTo(RecaptchaV2Adapter.URL_API))
                .andRespond(withStatus(HttpStatus.valueOf(status))
                        .contentType(MediaType.TEXT_HTML)
                        .body("<html>error</html>"));

        ServicioNoDisponibleException error = catchThrowableOfType(ServicioNoDisponibleException.class,
                () -> adaptador.verificar(TOKEN));

        assertThat(error).isNotNull();
        assertThat(error.getMessage()).isEqualTo(RecaptchaV2Adapter.MENSAJE_NO_DISPONIBLE);
        sinDatosSensibles(error);
    }

    @ParameterizedTest
    @ValueSource(strings = {"<html>no es json</html>", "[]", "{\"hostname\": \"localhost\"}",
            "{\"success\": \"true\"}", "null"})
    void unCuerpoIlegibleOSinSuccessBooleano_esServicioNoDisponible(String cuerpo) {
        // Falla cerrado: nada que no sea un success booleano deja pasar el registro.
        servidor.expect(once(), requestTo(RecaptchaV2Adapter.URL_API))
                .andRespond(withSuccess(cuerpo, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> adaptador.verificar(TOKEN))
                .isInstanceOf(ServicioNoDisponibleException.class)
                .hasMessage(RecaptchaV2Adapter.MENSAJE_NO_DISPONIBLE);
    }

    @Test
    void unaRespuesta200SinCuerpo_esServicioNoDisponible() {
        servidor.expect(once(), requestTo(RecaptchaV2Adapter.URL_API)).andRespond(withSuccess());

        assertThatThrownBy(() -> adaptador.verificar(TOKEN)).isInstanceOf(ServicioNoDisponibleException.class);
    }

    @Test
    void sinRespuesta_esServicioNoDisponible() {
        servidor.expect(once(), requestTo(RecaptchaV2Adapter.URL_API))
                .andRespond(withException(new SocketTimeoutException("Read timed out")));

        assertThatThrownBy(() -> adaptador.verificar(TOKEN)).isInstanceOf(ServicioNoDisponibleException.class);
    }

    @Test
    void timeoutDeLecturaReal_cortaLaEsperaYEsServicioNoDisponible() throws IOException {
        // Un servidor que acepta la conexion (la completa el sistema operativo,
        // en la cola del socket) y nunca responde.
        try (ServerSocket mudo = new ServerSocket(0, 10, InetAddress.getLoopbackAddress())) {
            RecaptchaV2Adapter conTimeouts = new RecaptchaV2Adapter(
                    "http://127.0.0.1:" + mudo.getLocalPort() + "/recaptcha/api/siteverify", SECRETO,
                    Duration.ofSeconds(2), Duration.ofMillis(300));

            long inicio = System.nanoTime();
            ServicioNoDisponibleException error = catchThrowableOfType(ServicioNoDisponibleException.class,
                    () -> conTimeouts.verificar(TOKEN));
            Duration espera = Duration.ofNanos(System.nanoTime() - inicio);

            assertThat(error).isNotNull();
            assertThat(espera).isLessThan(Duration.ofSeconds(5));
            sinDatosSensibles(error);
        }
    }

    @Test
    void conexionRechazada_esServicioNoDisponible() throws IOException {
        int puertoCerrado;
        try (ServerSocket libre = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            puertoCerrado = libre.getLocalPort();
        }
        RecaptchaV2Adapter sinServidor = new RecaptchaV2Adapter(
                "http://127.0.0.1:" + puertoCerrado + "/recaptcha/api/siteverify", SECRETO,
                Duration.ofSeconds(2), Duration.ofSeconds(2));

        assertThatThrownBy(() -> sinServidor.verificar(TOKEN)).isInstanceOf(ServicioNoDisponibleException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " "})
    void sinSecreto_noArrancaYNombraLaVariable(String secreto) {
        assertThatThrownBy(() -> new RecaptchaV2Adapter(RestClient.builder(), RecaptchaV2Adapter.URL_API, secreto))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CAPTCHA_SECRET");
    }

    @Test
    void sinCaptchaAdapter_noExigeNiVerifica() {
        SinCaptchaAdapter sin = new SinCaptchaAdapter();

        assertThat(sin.exigido()).isFalse();
        assertThatCode(() -> sin.verificar(null)).doesNotThrowAnyException();
    }

    private static void sinDatosSensibles(RuntimeException error) {
        assertThat(error.getMessage()).doesNotContain(SECRETO, TOKEN);
    }
}
