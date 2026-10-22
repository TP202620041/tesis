package pe.edu.upc.viasegura.common.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.CorreoSaliente;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;

/**
 * Correo por la API HTTP de Resend (DEP-08), para produccion: el plan de
 * Railway bloquea el SMTP saliente. Se activa con {@code app.correo.tipo=resend}
 * ({@code CORREO_TIPO=resend}).
 *
 * <p><b>Sin SDK ni dependencias nuevas</b> (la imagen esta al borde de los
 * 400 MB): un {@code POST https://api.resend.com/emails} con el
 * {@link RestClient} de Spring y el {@link HttpClient} del JDK. Cabeceras:</p>
 * <ul>
 *   <li>{@code Authorization: Bearer <CORREO_API_KEY>};</li>
 *   <li>{@code Content-Type: application/json};</li>
 *   <li>{@code User-Agent}: Resend responde 403 (error 1010) a un pedido sin
 *       ella.</li>
 * </ul>
 *
 * <p><b>Timeouts</b>: 3 s de conexion y 10 s de lectura por defecto, los de la
 * propuesta aceptada. El envio corre en el executor asincrono acotado, fuera
 * de la peticion: el timeout acota cuanto ocupa uno de sus pocos hilos un
 * proveedor que no responde. <b>Sin reintentos</b> en esta version: llegan con
 * ENVIO_CORREO (NC-05), que registrara los intentos.</p>
 *
 * <p><b>Errores:</b> una respuesta 4xx/5xx o la falta de respuesta se traducen
 * a {@link CorreoNoEnviadoException} con el status HTTP y el codigo de error de
 * Resend ({@code validation_error}, {@code rate_limit_exceeded}...). Nunca el
 * {@code message} de Resend (puede repetir la direccion del destinatario), el
 * texto del correo ni la clave.</p>
 *
 * <p><b>Remitente:</b> {@code NOTIF_FROM}, de un dominio verificado en Resend
 * (SPF y DKIM). Desde {@code onboarding@resend.dev} solo se puede escribir al
 * correo del dueno de la cuenta de Resend; a cualquier otro destinatario
 * responde 403.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.correo.tipo", havingValue = "resend")
public class ResendCorreoAdapter implements CorreoSaliente {

    static final String URL_API = "https://api.resend.com/emails";
    static final String USER_AGENT = "CiudadViva-backend/1.0";
    /** Nombre de la etiqueta de Resend con la que viaja {@link MensajeCorreo#etiqueta()}. */
    static final String NOMBRE_ETIQUETA = "categoria";

    /** El codigo de error de Resend se copia al log solo si tiene esta forma. */
    private static final Pattern CODIGO_DE_ERROR = Pattern.compile("[a-z0-9_]{1,64}");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final RestClient restClient;
    private final URI url;
    private final String remitente;

    @Autowired
    public ResendCorreoAdapter(
            @Value("${app.correo.api-key:}") String apiKey,
            @Value("${app.notificaciones.email-remitente:}") String remitente,
            @Value("${app.correo.resend.timeout-conexion-segundos:3}") long timeoutConexionSegundos,
            @Value("${app.correo.resend.timeout-lectura-segundos:10}") long timeoutLecturaSegundos) {
        this(URL_API, apiKey, remitente,
                Duration.ofSeconds(timeoutConexionSegundos), Duration.ofSeconds(timeoutLecturaSegundos));
        log.info("Correo saliente por Resend (remitente {})", this.remitente);
    }

    /** Con otra URL y timeouts: el test del timeout real contra un socket local. */
    ResendCorreoAdapter(String url, String apiKey, String remitente, Duration timeoutConexion,
                        Duration timeoutLectura) {
        this(RestClient.builder().requestFactory(fabricaConTimeouts(timeoutConexion, timeoutLectura)),
                url, apiKey, remitente);
    }

    /**
     * Con un {@link RestClient.Builder} ya preparado: los tests lo atan a
     * {@code MockRestServiceServer}. No toca su {@code requestFactory}.
     */
    ResendCorreoAdapter(RestClient.Builder builder, String url, String apiKey, String remitente) {
        String clave = requerida(apiKey, "CORREO_API_KEY");
        this.remitente = requerida(remitente, "NOTIF_FROM").trim();
        this.url = URI.create(url);
        this.restClient = builder
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + clave.trim())
                .defaultHeader(HttpHeaders.USER_AGENT, USER_AGENT)
                .build();
    }

    private static String requerida(String valor, String variable) {
        if (!StringUtils.hasText(valor)) {
            throw new IllegalStateException("Con CORREO_TIPO=resend falta " + variable
                    + ": la aplicacion no arranca sin ella (README, \"Correo saliente\")");
        }
        return valor;
    }

    private static JdkClientHttpRequestFactory fabricaConTimeouts(Duration conexion, Duration lectura) {
        HttpClient cliente = HttpClient.newBuilder()
                .connectTimeout(conexion)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        JdkClientHttpRequestFactory fabrica = new JdkClientHttpRequestFactory(cliente);
        fabrica.setReadTimeout(lectura);
        return fabrica;
    }

    @Override
    public void enviar(MensajeCorreo mensaje) {
        CuerpoResend cuerpo = new CuerpoResend(remitente, List.of(mensaje.para()), mensaje.asunto(),
                mensaje.texto(), List.of(new EtiquetaResend(NOMBRE_ETIQUETA, mensaje.etiqueta())));
        try {
            RespuestaResend respuesta = restClient.post()
                    .uri(url)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(cuerpo)
                    .retrieve()
                    .body(RespuestaResend.class);
            log.info("Correo [{}] aceptado por Resend (id {})", mensaje.etiqueta(),
                    respuesta != null ? respuesta.id() : "sin id");
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            throw new CorreoNoEnviadoException("Resend rechazo el correo [" + mensaje.etiqueta() + "]: HTTP "
                    + status + codigoDeError(e), status);
        } catch (ResourceAccessException e) {
            String causa = NestedExceptionUtils.getMostSpecificCause(e).getClass().getSimpleName();
            throw new CorreoNoEnviadoException("Resend no respondio a tiempo o no se pudo conectar ["
                    + mensaje.etiqueta() + "] (" + causa + ")");
        } catch (RestClientException e) {
            throw new CorreoNoEnviadoException("Error al llamar a Resend [" + mensaje.etiqueta() + "] ("
                    + e.getClass().getSimpleName() + ")");
        }
    }

    /** {@code ", validation_error"} si la respuesta trae un {@code name} con forma de codigo; si no, vacio. */
    private static String codigoDeError(RestClientResponseException e) {
        try {
            JsonNode error = JSON.readTree(e.getResponseBodyAsByteArray());
            String codigo = error == null ? null : error.path("name").asText(null);
            return codigo != null && CODIGO_DE_ERROR.matcher(codigo).matches() ? ", " + codigo : "";
        } catch (Exception ilegible) {
            return "";
        }
    }

    /** Cuerpo de {@code POST /emails} (solo los campos que se usan). */
    record CuerpoResend(String from, List<String> to, String subject, String text, List<EtiquetaResend> tags) {
    }

    record EtiquetaResend(String name, String value) {
    }

    /** Respuesta 200 de {@code POST /emails}: el id del correo en Resend, para buscarlo en su panel. */
    record RespuestaResend(String id) {
    }
}
