package pe.edu.upc.viasegura.common.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.SocketTimeoutException;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;

/**
 * Adaptador de Resend (DEP-08) sin red: {@link MockRestServiceServer} atado
 * al {@link RestClient.Builder} del adaptador. Los dos ultimos casos si abren
 * un socket, pero local: prueban los timeouts reales del cliente HTTP del JDK.
 *
 * <p>En todos los fallos se comprueba que el mensaje de la excepcion (que
 * termina en el log) no lleva la clave, el destinatario ni el texto del
 * correo.</p>
 */
class ResendCorreoAdapterTest {

    /** Inventada: con la forma de una clave de Resend, pero no es una clave. */
    private static final String CLAVE = "re_ClaveDePruebaQueNoExiste_123";
    private static final String REMITENTE = "Ciudad Viva <no-reply@ciudadviva.test>";
    private static final String DESTINATARIO = "ana.vecina@lima.pe";
    private static final String TOKEN = "3f0c2a5e-token-de-recuperacion";
    private static final MensajeCorreo MENSAJE = new MensajeCorreo(DESTINATARIO,
            "Ciudad Viva: recuperacion de contrasena", "Hola Ana, usa este token: " + TOKEN, "recuperacion");

    private MockRestServiceServer servidor;
    private ResendCorreoAdapter adaptador;

    @BeforeEach
    void crear() {
        RestClient.Builder builder = RestClient.builder();
        servidor = MockRestServiceServer.bindTo(builder).build();
        adaptador = new ResendCorreoAdapter(builder, ResendCorreoAdapter.URL_API, CLAVE, REMITENTE);
    }

    @Test
    void envia_unPostJsonConLaClaveElUserAgentYLaEtiqueta() {
        servidor.expect(once(), requestTo("https://api.resend.com/emails"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer " + CLAVE))
                .andExpect(header(HttpHeaders.USER_AGENT, ResendCorreoAdapter.USER_AGENT))
                .andExpect(header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE))
                .andExpect(content().json("""
                        {
                          "from": "Ciudad Viva <no-reply@ciudadviva.test>",
                          "to": ["ana.vecina@lima.pe"],
                          "subject": "Ciudad Viva: recuperacion de contrasena",
                          "text": "Hola Ana, usa este token: 3f0c2a5e-token-de-recuperacion",
                          "tags": [{"name": "categoria", "value": "recuperacion"}]
                        }
                        """, JsonCompareMode.STRICT))
                .andRespond(withSuccess("{\"id\":\"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794\"}",
                        MediaType.APPLICATION_JSON));

        adaptador.enviar(MENSAJE);

        servidor.verify();
    }

    @Test
    void unaRespuesta200SinCuerpo_tambienEsEnvioExitoso() {
        servidor.expect(once(), requestTo(ResendCorreoAdapter.URL_API))
                .andRespond(withSuccess());

        adaptador.enviar(MENSAJE);

        servidor.verify();
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 401, 403, 404, 422, 429})
    void error4xx_esCorreoNoEnviadoConStatusYCodigoDeResend(int status) {
        // Resend repite datos del pedido en `message` (aqui, el destinatario):
        // solo `name` puede llegar al log.
        servidor.expect(once(), requestTo(ResendCorreoAdapter.URL_API))
                .andRespond(withStatus(HttpStatus.valueOf(status))
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("""
                                {"statusCode": %d, "name": "validation_error",
                                 "message": "Invalid `to` field: %s"}
                                """.formatted(status, DESTINATARIO)));

        CorreoNoEnviadoException error = catchThrowableOfType(CorreoNoEnviadoException.class,
                () -> adaptador.enviar(MENSAJE));

        assertThat(error).isNotNull();
        assertThat(error.status()).hasValue(status);
        assertThat(error.getMessage())
                .contains("HTTP " + status, "validation_error", "[recuperacion]");
        sinDatosSensibles(error);
        assertThat(error.getCause()).isNull();
    }

    @ParameterizedTest
    @ValueSource(ints = {500, 502, 503})
    void error5xx_esCorreoNoEnviadoConStatus(int status) {
        // Un 5xx de un proxy puede no traer JSON: el mensaje queda sin codigo.
        servidor.expect(once(), requestTo(ResendCorreoAdapter.URL_API))
                .andRespond(withStatus(HttpStatus.valueOf(status))
                        .contentType(MediaType.TEXT_HTML)
                        .body("<html>error para " + DESTINATARIO + "</html>"));

        CorreoNoEnviadoException error = catchThrowableOfType(CorreoNoEnviadoException.class,
                () -> adaptador.enviar(MENSAJE));

        assertThat(error).isNotNull();
        assertThat(error.status()).hasValue(status);
        assertThat(error.getMessage()).endsWith("HTTP " + status);
        sinDatosSensibles(error);
    }

    @Test
    void unCodigoDeErrorConFormaRara_noSeCopiaAlMensaje() {
        servidor.expect(once(), requestTo(ResendCorreoAdapter.URL_API))
                .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"name\": \"" + DESTINATARIO + "\"}"));

        CorreoNoEnviadoException error = catchThrowableOfType(CorreoNoEnviadoException.class,
                () -> adaptador.enviar(MENSAJE));

        assertThat(error.getMessage()).endsWith("HTTP 422");
        sinDatosSensibles(error);
    }

    @Test
    void sinRespuesta_esCorreoNoEnviadoSinStatus() {
        servidor.expect(once(), requestTo(ResendCorreoAdapter.URL_API))
                .andRespond(withException(new SocketTimeoutException("Read timed out")));

        CorreoNoEnviadoException error = catchThrowableOfType(CorreoNoEnviadoException.class,
                () -> adaptador.enviar(MENSAJE));

        assertThat(error).isNotNull();
        assertThat(error.status()).isEmpty();
        assertThat(error.getMessage()).contains("no respondio", "SocketTimeoutException");
        sinDatosSensibles(error);
    }

    @Test
    void timeoutDeLecturaReal_cortaLaEsperaYEsCorreoNoEnviado() throws IOException {
        // Un servidor que acepta la conexion (la completa el sistema operativo,
        // en la cola del socket) y nunca responde.
        try (ServerSocket mudo = new ServerSocket(0, 10, InetAddress.getLoopbackAddress())) {
            ResendCorreoAdapter conTimeouts = new ResendCorreoAdapter(
                    "http://127.0.0.1:" + mudo.getLocalPort() + "/emails", CLAVE, REMITENTE,
                    Duration.ofSeconds(2), Duration.ofMillis(300));

            long inicio = System.nanoTime();
            CorreoNoEnviadoException error = catchThrowableOfType(CorreoNoEnviadoException.class,
                    () -> conTimeouts.enviar(MENSAJE));
            Duration espera = Duration.ofNanos(System.nanoTime() - inicio);

            assertThat(error).isNotNull();
            assertThat(error.status()).isEmpty();
            assertThat(error.getMessage()).contains("Timeout");
            assertThat(espera).isLessThan(Duration.ofSeconds(5));
            sinDatosSensibles(error);
        }
    }

    @Test
    void conexionRechazada_esCorreoNoEnviado() throws IOException {
        int puertoCerrado;
        try (ServerSocket libre = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            puertoCerrado = libre.getLocalPort();
        }
        ResendCorreoAdapter sinServidor = new ResendCorreoAdapter(
                "http://127.0.0.1:" + puertoCerrado + "/emails", CLAVE, REMITENTE,
                Duration.ofSeconds(2), Duration.ofSeconds(2));

        CorreoNoEnviadoException error = catchThrowableOfType(CorreoNoEnviadoException.class,
                () -> sinServidor.enviar(MENSAJE));

        assertThat(error).isNotNull();
        assertThat(error.status()).isEmpty();
        sinDatosSensibles(error);
    }

    @Test
    void sinClave_noArrancaYNoRepiteValores() {
        assertThatThrownBy(() -> new ResendCorreoAdapter(RestClient.builder(), ResendCorreoAdapter.URL_API, " ",
                REMITENTE))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CORREO_API_KEY")
                .hasMessageNotContaining(REMITENTE);
    }

    @Test
    void sinRemitente_noArrancaYNoRepiteLaClave() {
        assertThatThrownBy(() -> new ResendCorreoAdapter(RestClient.builder(), ResendCorreoAdapter.URL_API, CLAVE,
                ""))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("NOTIF_FROM")
                .hasMessageNotContaining(CLAVE);
    }

    private static void sinDatosSensibles(CorreoNoEnviadoException error) {
        assertThat(error.getMessage()).doesNotContain(CLAVE, DESTINATARIO, TOKEN);
    }
}
