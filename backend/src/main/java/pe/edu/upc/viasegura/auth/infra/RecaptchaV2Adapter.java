package pe.edu.upc.viasegura.auth.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import pe.edu.upc.viasegura.auth.port.VerificadorDeCaptcha;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;

/**
 * Google reCAPTCHA v2, casilla «No soy un robot» (NC-08). Se activa con
 * {@code app.captcha.tipo=recaptcha} ({@code CAPTCHA_TIPO=recaptcha}).
 *
 * <p>Calcado de {@code common/infra/ResendCorreoAdapter}: sin SDK ni
 * dependencias nuevas, un {@code POST
 * https://www.google.com/recaptcha/api/siteverify} con el {@link RestClient}
 * de Spring y el {@link HttpClient} del JDK. El cuerpo es
 * {@code application/x-www-form-urlencoded} con {@code secret} y
 * {@code response}; <b>sin {@code remoteip}</b>, que Google admite como
 * opcional: la IP del ciudadano es un dato personal que no hace falta para
 * verificar (minimizacion, Ley N.° 29733).</p>
 *
 * <p><b>Timeouts</b>: 3 s de conexion y 5 s de lectura. La verificacion corre
 * en el hilo de la peticion (el ciudadano espera la respuesta del registro),
 * pero fuera de la transaccion. <b>Sin reintentos ni redirecciones.</b></p>
 *
 * <p><b>Falla cerrado.</b> {@code success=false} es {@link BusinessException}
 * (409) con un mensaje para el ciudadano; una respuesta de error HTTP, un
 * timeout, un error de conexion o un JSON ilegible son
 * {@link ServicioNoDisponibleException} (503). En el log solo van los
 * {@code error-codes} de Google con forma de codigo; nunca el token ni el
 * secreto.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.captcha.tipo", havingValue = "recaptcha")
public class RecaptchaV2Adapter implements VerificadorDeCaptcha {

    static final String URL_API = "https://www.google.com/recaptcha/api/siteverify";
    static final String MENSAJE_RECHAZADO = "No pudimos confirmar que no eres un robot. Vuelve a intentarlo.";
    static final String MENSAJE_NO_DISPONIBLE =
            "No pudimos verificar el captcha en este momento. Intenta de nuevo en unos minutos.";

    /** Un codigo de error de Google se copia al log solo si tiene esta forma ({@code timeout-or-duplicate}). */
    private static final Pattern CODIGO_DE_ERROR = Pattern.compile("[a-z0-9-]{1,64}");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final RestClient restClient;
    private final URI url;
    private final String secreto;

    @Autowired
    public RecaptchaV2Adapter(
            @Value("${app.captcha.secret:}") String secreto,
            @Value("${app.captcha.recaptcha.timeout-conexion-segundos:3}") long timeoutConexionSegundos,
            @Value("${app.captcha.recaptcha.timeout-lectura-segundos:5}") long timeoutLecturaSegundos) {
        this(URL_API, secreto, Duration.ofSeconds(timeoutConexionSegundos),
                Duration.ofSeconds(timeoutLecturaSegundos));
        log.info("Registro con captcha reCAPTCHA v2 (CAPTCHA_TIPO=recaptcha)");
    }

    /** Con otra URL y timeouts: el test del timeout real contra un socket local. */
    RecaptchaV2Adapter(String url, String secreto, Duration timeoutConexion, Duration timeoutLectura) {
        this(RestClient.builder().requestFactory(fabricaConTimeouts(timeoutConexion, timeoutLectura)),
                url, secreto);
    }

    /**
     * Con un {@link RestClient.Builder} ya preparado: los tests lo atan a
     * {@code MockRestServiceServer}. No toca su {@code requestFactory}.
     */
    RecaptchaV2Adapter(RestClient.Builder builder, String url, String secreto) {
        if (!StringUtils.hasText(secreto)) {
            throw new IllegalStateException("Con CAPTCHA_TIPO=recaptcha falta CAPTCHA_SECRET: la aplicacion"
                    + " no arranca sin ella (README, \"Captcha en el registro\")");
        }
        this.secreto = secreto.trim();
        this.url = URI.create(url);
        this.restClient = builder.build();
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
    public boolean exigido() {
        return true;
    }

    @Override
    public void verificar(String token) {
        MultiValueMap<String, String> formulario = new LinkedMultiValueMap<>();
        formulario.add("secret", secreto);
        formulario.add("response", token);

        byte[] cuerpo;
        try {
            cuerpo = restClient.post()
                    .uri(url)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(formulario)
                    .retrieve()
                    .body(byte[].class);
        } catch (RestClientResponseException e) {
            log.warn("reCAPTCHA respondio HTTP {}", e.getStatusCode().value());
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        } catch (ResourceAccessException e) {
            log.warn("reCAPTCHA no respondio a tiempo o no se pudo conectar ({})",
                    NestedExceptionUtils.getMostSpecificCause(e).getClass().getSimpleName());
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        } catch (RestClientException e) {
            log.warn("Error al llamar a reCAPTCHA ({})", e.getClass().getSimpleName());
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        }

        JsonNode respuesta = leer(cuerpo);
        JsonNode exito = respuesta.get("success");
        if (exito == null || !exito.isBoolean()) {
            log.warn("reCAPTCHA respondio sin un campo success booleano");
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        }
        if (!exito.booleanValue()) {
            log.info("reCAPTCHA rechazo el token (error-codes: {})", codigosDeError(respuesta));
            throw new BusinessException(MENSAJE_RECHAZADO);
        }
    }

    private static JsonNode leer(byte[] cuerpo) {
        if (cuerpo == null || cuerpo.length == 0) {
            log.warn("reCAPTCHA respondio sin cuerpo");
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        }
        JsonNode nodo;
        try {
            nodo = JSON.readTree(cuerpo);
        } catch (Exception ilegible) {
            nodo = null;
        }
        if (nodo == null || !nodo.isObject()) {
            log.warn("reCAPTCHA respondio un cuerpo ilegible");
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        }
        return nodo;
    }

    /** Los {@code error-codes} con forma de codigo; el resto se descarta. */
    static List<String> codigosDeError(JsonNode respuesta) {
        List<String> codigos = new ArrayList<>();
        JsonNode lista = respuesta.path("error-codes");
        if (lista.isArray()) {
            for (JsonNode codigo : lista) {
                if (codigo.isTextual() && CODIGO_DE_ERROR.matcher(codigo.asText()).matches()) {
                    codigos.add(codigo.asText());
                }
            }
        }
        return codigos;
    }
}
