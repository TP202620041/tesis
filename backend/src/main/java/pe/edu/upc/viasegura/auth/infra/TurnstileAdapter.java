package pe.edu.upc.viasegura.auth.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
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
 * Cloudflare Turnstile (NC-08b, decision del usuario del 28/10: reemplaza a
 * Google reCAPTCHA v2). Se activa con {@code app.captcha.tipo=turnstile}
 * ({@code CAPTCHA_TIPO=turnstile}).
 *
 * <p>Sin SDK ni dependencias nuevas, como {@code common/infra/ResendCorreoAdapter}:
 * un {@code POST https://challenges.cloudflare.com/turnstile/v0/siteverify}
 * con el {@link RestClient} de Spring sobre el {@link HttpClient} del JDK. El
 * cuerpo es {@code application/x-www-form-urlencoded} con {@code secret} y
 * {@code response}; <b>sin {@code remoteip}</b> (opcional en Cloudflare: la IP
 * del ciudadano es un dato personal que no hace falta para verificar,
 * minimizacion de la Ley N.° 29733) y <b>sin {@code idempotency_key}</b>, que
 * solo sirve para reintentar y aqui no se reintenta.</p>
 *
 * <p><b>Timeouts</b>: 3 s de conexion y 5 s de lectura. La verificacion corre
 * en el hilo de la peticion (el ciudadano espera la respuesta del registro),
 * pero fuera de la transaccion. <b>Sin reintentos ni redirecciones.</b> Un
 * token sirve una sola vez: reintentar un pedido que si llego daria
 * {@code timeout-or-duplicate}.</p>
 *
 * <p><b>Falla cerrado.</b> Solo {@code success=true} (y, si hay lista, un
 * {@code hostname} admitido) deja pasar el registro:</p>
 * <ul>
 *   <li>{@code success=false} por el token (vencido, usado, invalido) &rarr;
 *       {@link BusinessException} (409) con un mensaje para el ciudadano;</li>
 *   <li>{@code success=false} por un codigo que no es culpa del ciudadano
 *       ({@link #CODIGOS_DEL_SERVIDOR}: clave secreta mal configurada, pedido
 *       mal formado, error interno de Cloudflare) &rarr;
 *       {@link ServicioNoDisponibleException} (503): un 409 «marca la casilla
 *       otra vez» haria reintentar al ciudadano sin remedio;</li>
 *   <li>una respuesta de error HTTP (Cloudflare responde 400 a una clave
 *       secreta invalida), un timeout, un error de conexion o un JSON
 *       ilegible &rarr; {@link ServicioNoDisponibleException} (503).</li>
 * </ul>
 *
 * <p><b>Hostname.</b> Cloudflare devuelve el {@code hostname} donde se
 * resolvio el widget y recomienda compararlo. Con
 * {@code app.captcha.turnstile.hostnames} ({@code CAPTCHA_HOSTNAMES}) no vacia
 * (en {@code prod}, por defecto {@code ciudadviva.app,www.ciudadviva.app}),
 * un token aprobado en otro hostname es 409, y una aprobacion sin
 * {@code hostname} es 503 (respuesta inesperada). La comparacion es exacta y
 * sin distinguir mayusculas: sin comodines ni sufijos. De paso detecta una
 * clave secreta de prueba puesta por error en produccion: esas claves aprueban
 * cualquier token con {@code hostname} {@code example.com}.</p>
 *
 * <p><b>Sin {@code action}.</b> La PWA tiene un solo widget (el registro) y el
 * token es de un solo uso, asi que comparar la accion no agrega nada; exigiria
 * ademas que el frontend fije {@code data-action}, un cambio de contrato.</p>
 *
 * <p>En el log solo van los {@code error-codes} con forma de codigo y el
 * {@code hostname} con forma de hostname; nunca el token ni el secreto.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.captcha.tipo", havingValue = "turnstile")
public class TurnstileAdapter implements VerificadorDeCaptcha {

    static final String URL_API = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    static final String MENSAJE_RECHAZADO = "No pudimos confirmar que no eres un robot. Vuelve a intentarlo.";
    static final String MENSAJE_NO_DISPONIBLE =
            "No pudimos verificar el captcha en este momento. Intenta de nuevo en unos minutos.";

    /**
     * {@code error-codes} que no son culpa del ciudadano: la clave secreta
     * (falta o es invalida), el pedido mal formado o un error de Cloudflare.
     * Los demas ({@code invalid-input-response}, {@code timeout-or-duplicate},
     * {@code missing-input-response} o uno desconocido) son el token.
     */
    static final Set<String> CODIGOS_DEL_SERVIDOR =
            Set.of("missing-input-secret", "invalid-input-secret", "bad-request", "internal-error");

    /** Un codigo de error se copia al log solo si tiene esta forma ({@code timeout-or-duplicate}). */
    private static final Pattern CODIGO_DE_ERROR = Pattern.compile("[a-z0-9-]{1,64}");
    /** Una etiqueta DNS: letras, digitos y guiones, sin guion al principio ni al final. */
    private static final Pattern HOSTNAME =
            Pattern.compile("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*");
    private static final int LARGO_MAXIMO_HOSTNAME = 253;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final RestClient restClient;
    private final URI url;
    private final String secreto;
    private final Set<String> hostnamesPermitidos;

    /**
     * {@code app.captcha.turnstile.url} no tiene variable de entorno ni esta
     * en {@code application.yml}: solo la cambian los tests
     * ({@code RegistroTurnstileIT}, contra un servidor local).
     */
    @Autowired
    public TurnstileAdapter(
            @Value("${app.captcha.secret:}") String secreto,
            @Value("${app.captcha.turnstile.hostnames:}") String hostnames,
            @Value("${app.captcha.turnstile.url:" + URL_API + "}") String url,
            @Value("${app.captcha.turnstile.timeout-conexion-segundos:3}") long timeoutConexionSegundos,
            @Value("${app.captcha.turnstile.timeout-lectura-segundos:5}") long timeoutLecturaSegundos) {
        this(RestClient.builder().requestFactory(fabricaConTimeouts(
                        Duration.ofSeconds(timeoutConexionSegundos), Duration.ofSeconds(timeoutLecturaSegundos))),
                url, secreto, hostnames);
        log.info("Registro con captcha Cloudflare Turnstile (CAPTCHA_TIPO=turnstile); hostnames admitidos: {}",
                hostnamesPermitidos.isEmpty() ? "cualquiera (CAPTCHA_HOSTNAMES vacia)" : hostnamesPermitidos);
    }

    /** Con otra URL y timeouts: el test del timeout real contra un socket local. */
    TurnstileAdapter(String url, String secreto, String hostnames, Duration timeoutConexion,
            Duration timeoutLectura) {
        this(RestClient.builder().requestFactory(fabricaConTimeouts(timeoutConexion, timeoutLectura)),
                url, secreto, hostnames);
    }

    /**
     * Con un {@link RestClient.Builder} ya preparado: los tests lo atan a
     * {@code MockRestServiceServer}. No toca su {@code requestFactory}.
     */
    TurnstileAdapter(RestClient.Builder builder, String url, String secreto, String hostnames) {
        if (!StringUtils.hasText(secreto)) {
            throw new IllegalStateException("Con CAPTCHA_TIPO=turnstile falta CAPTCHA_SECRET: la aplicacion"
                    + " no arranca sin ella (README, \"Captcha en el registro\")");
        }
        this.secreto = secreto.trim();
        this.hostnamesPermitidos = hostnamesPermitidos(hostnames);
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

    /**
     * La lista de {@code CAPTCHA_HOSTNAMES}, separada por comas: recortada, en
     * minusculas y sin vacios. Vacia, no se compara el hostname. Una entrada
     * que no es un hostname (con esquema, puerto, ruta o comodin) no arranca:
     * nunca coincidiria y bloquearia todos los registros.
     */
    static Set<String> hostnamesPermitidos(String lista) {
        Set<String> hostnames = new LinkedHashSet<>();
        if (lista == null) {
            return Collections.unmodifiableSet(hostnames);
        }
        for (String entrada : lista.split(",")) {
            String hostname = entrada.trim().toLowerCase(Locale.ROOT);
            if (hostname.isEmpty()) {
                continue;
            }
            if (!esHostname(hostname)) {
                throw new IllegalStateException(("CAPTCHA_HOSTNAMES (app.captcha.turnstile.hostnames) tiene una"
                        + " entrada que no es un hostname: '%s'. Escriba solo el nombre, sin esquema, puerto,"
                        + " ruta ni comodines (por ejemplo, ciudadviva.app,www.ciudadviva.app).")
                        .formatted(entrada.trim()));
            }
            hostnames.add(hostname);
        }
        return Collections.unmodifiableSet(hostnames);
    }

    private static boolean esHostname(String valor) {
        return valor.length() <= LARGO_MAXIMO_HOSTNAME && HOSTNAME.matcher(valor).matches();
    }

    @Override
    public boolean exigido() {
        return true;
    }

    @Override
    public void verificar(String token) {
        JsonNode respuesta = leer(llamar(token));
        JsonNode exito = respuesta.get("success");
        if (exito == null || !exito.isBoolean()) {
            log.warn("Turnstile respondio sin un campo success booleano");
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        }
        if (!exito.booleanValue()) {
            List<String> codigos = codigosDeError(respuesta);
            if (codigos.stream().anyMatch(CODIGOS_DEL_SERVIDOR::contains)) {
                log.warn("Turnstile no verifico el token por un problema de configuracion o propio"
                        + " (error-codes: {})", codigos);
                throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
            }
            log.info("Turnstile rechazo el token (error-codes: {})", codigos);
            throw new BusinessException(MENSAJE_RECHAZADO);
        }
        exigirHostnamePermitido(respuesta);
        if (conClaveDePrueba(respuesta)) {
            log.warn("Turnstile aprobo con una clave secreta de prueba: cualquier token pasa (solo desarrollo)");
        }
    }

    private byte[] llamar(String token) {
        MultiValueMap<String, String> formulario = new LinkedMultiValueMap<>();
        formulario.add("secret", secreto);
        formulario.add("response", token);
        try {
            return restClient.post()
                    .uri(url)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(formulario)
                    .retrieve()
                    .body(byte[].class);
        } catch (RestClientResponseException e) {
            // Cloudflare responde 400 con JSON a una clave secreta invalida o a
            // un pedido mal formado: sus codigos dicen que revisar.
            log.warn("Turnstile respondio HTTP {} (error-codes: {})", e.getStatusCode().value(),
                    codigosDeError(e.getResponseBodyAsByteArray()));
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        } catch (ResourceAccessException e) {
            log.warn("Turnstile no respondio a tiempo o no se pudo conectar ({})",
                    NestedExceptionUtils.getMostSpecificCause(e).getClass().getSimpleName());
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        } catch (RestClientException e) {
            log.warn("Error al llamar a Turnstile ({})", e.getClass().getSimpleName());
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        }
    }

    private void exigirHostnamePermitido(JsonNode respuesta) {
        if (hostnamesPermitidos.isEmpty()) {
            return;
        }
        JsonNode hostname = respuesta.get("hostname");
        if (hostname == null || !hostname.isTextual()) {
            log.warn("Turnstile aprobo el token sin un hostname");
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        }
        String valor = hostname.asText().toLowerCase(Locale.ROOT);
        if (!hostnamesPermitidos.contains(valor)) {
            log.warn("Turnstile aprobo un token resuelto en otro hostname ({}){}",
                    esHostname(valor) ? valor : "<no es un hostname>",
                    conClaveDePrueba(respuesta) ? ": la clave secreta es una de prueba de Cloudflare" : "");
            throw new BusinessException(MENSAJE_RECHAZADO);
        }
    }

    /** Las claves de prueba de Cloudflare marcan su respuesta con {@code metadata.result_with_testing_key}. */
    private static boolean conClaveDePrueba(JsonNode respuesta) {
        return respuesta.path("metadata").path("result_with_testing_key").asBoolean(false);
    }

    private static JsonNode leer(byte[] cuerpo) {
        if (cuerpo == null || cuerpo.length == 0) {
            log.warn("Turnstile respondio sin cuerpo");
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        }
        JsonNode nodo = comoObjeto(cuerpo);
        if (nodo == null) {
            log.warn("Turnstile respondio un cuerpo ilegible");
            throw new ServicioNoDisponibleException(MENSAJE_NO_DISPONIBLE);
        }
        return nodo;
    }

    /** El cuerpo como objeto JSON, o {@code null} si no lo es. */
    private static JsonNode comoObjeto(byte[] cuerpo) {
        try {
            JsonNode nodo = JSON.readTree(cuerpo);
            return nodo != null && nodo.isObject() ? nodo : null;
        } catch (Exception ilegible) {
            return null;
        }
    }

    /** Los {@code error-codes} de un cuerpo de error; vacio si no es un objeto JSON. */
    private static List<String> codigosDeError(byte[] cuerpo) {
        JsonNode nodo = cuerpo == null || cuerpo.length == 0 ? null : comoObjeto(cuerpo);
        return nodo == null ? List.of() : codigosDeError(nodo);
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
