package pe.edu.upc.viasegura.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.OncePerRequestFilter;
import pe.edu.upc.viasegura.common.exception.ApiError;

/**
 * Encabezado de origen (DEP-14): el API solo atiende las peticiones que
 * pasaron por Cloudflare.
 *
 * <p>{@code api.ciudadviva.app} va con el proxy de Cloudflare (WAF, regla de
 * rutas de la app y limite de peticiones de escritura). Pero el borde de
 * Railway enruta por el {@code Host}: una peticion con
 * {@code Host: api.ciudadviva.app} enviada directo a su IP llegaba al backend
 * sin pasar por ninguna de esas defensas, y el backend no limita por IP. Es la
 * «HTTP Header Validation» que recomienda Cloudflare para proteger el origen:
 * una <i>Request Header Transform Rule</i> agrega este encabezado con un
 * secreto a cada peticion que pasa por el proxy, y este filtro rechaza con
 * 403 toda peticion que no lo traiga con ese valor.</p>
 *
 * <ul>
 *   <li><b>Con la maxima precedencia, antes que Spring Security</b>
 *   ({@code EncabezadoDeOrigenConfig}): una peticion rechazada no llega a
 *   CORS, al JWT ni a ningun controlador. Empata con el
 *   {@code CharacterEncodingFilter} y el {@code ForwardedHeaderFilter} de
 *   Spring Boot, que pueden correr antes sin cambiar lo que este filtro mira
 *   (ver {@link #esHealthcheck}).</li>
 *   <li><b>Sin pistas:</b> el 403 es el mismo {@link ApiError} «Acceso
 *   denegado» de cualquier otro 403 de la cadena de seguridad, igual sin el
 *   encabezado que con un valor equivocado.</li>
 *   <li><b>Comparacion en tiempo constante</b> ({@link MessageDigest#isEqual}
 *   sobre bytes, con el secreto como primer argumento: segun su contrato en
 *   el JDK 21, la duracion depende solo de la longitud de ese argumento, no
 *   de cuantos bytes coinciden ni de la longitud de lo que mande el
 *   cliente). Con dos secretos se comparan los dos siempre, sin
 *   cortocircuito.</li>
 *   <li><b>Nunca registra el valor</b> recibido ni el secreto, tampoco en los
 *   mensajes de un arranque fallido.</li>
 *   <li><b>Unica excepcion: {@code GET /actuator/health}</b>, exacta. El
 *   health check de Railway entra directo al contenedor, sin pasar por
 *   Cloudflare, y solo responde {@code {"status":"UP"}}. Ninguna otra ruta,
 *   ni otro metodo en esa ruta, queda exenta: el preflight CORS y las fotos
 *   de reporte tambien pasan por Cloudflare y traen el encabezado.</li>
 * </ul>
 *
 * <p>Se construye ya validado: un secreto vacio, de menos de
 * {@value #LONGITUD_MINIMA} caracteres o con caracteres que no son ASCII
 * visibles hace fallar el arranque. Acepta un segundo secreto, el anterior,
 * solo para rotar sin cortar el servicio (README, «Encabezado de origen
 * (DEP-14)»).</p>
 */
public class EncabezadoDeOrigenFilter extends OncePerRequestFilter {

    /** La unica ruta exenta, solo con GET. */
    static final String RUTA_HEALTHCHECK = "/actuator/health";

    /** Minimo de caracteres del secreto. {@code openssl rand -hex 32} da 64. */
    static final int LONGITUD_MINIMA = 32;

    static final String VARIABLE_SECRETO = "ORIGEN_SECRETO";
    static final String VARIABLE_SECRETO_ANTERIOR = "ORIGEN_SECRETO_ANTERIOR";

    private static final String COMO_GENERARLO = " Generelo con `openssl rand -hex 32` y cargue el mismo valor en la"
            + " Transform Rule de Cloudflare (backend/README.md, «Encabezado de origen (DEP-14)»).";

    /** Un token de RFC 9110 restringido a lo que acepta Cloudflare sin dudas. */
    private static final Pattern NOMBRE_DE_ENCABEZADO = Pattern.compile("[A-Za-z0-9-]+");

    private static final Logger log = LoggerFactory.getLogger(EncabezadoDeOrigenFilter.class);

    private final String encabezado;
    private final List<byte[]> secretosAceptados;
    private final ObjectMapper objectMapper;

    /**
     * @param encabezado      nombre del encabezado que agrega Cloudflare
     * @param secreto         el secreto vigente ({@code ORIGEN_SECRETO})
     * @param secretoAnterior el de antes de una rotacion en curso, o vacio
     * @throws IllegalStateException si algun valor no sirve; el mensaje nombra
     *                               la variable y nunca repite el secreto
     */
    public EncabezadoDeOrigenFilter(String encabezado, String secreto, String secretoAnterior,
                                    ObjectMapper objectMapper) {
        this.encabezado = validarEncabezado(encabezado);
        byte[] vigente = validarSecreto(VARIABLE_SECRETO, secreto);
        List<byte[]> aceptados = new ArrayList<>(2);
        aceptados.add(vigente);
        if (secretoAnterior != null && !secretoAnterior.isEmpty()) {
            byte[] anterior = validarSecreto(VARIABLE_SECRETO_ANTERIOR, secretoAnterior);
            if (MessageDigest.isEqual(vigente, anterior)) {
                throw new IllegalStateException(VARIABLE_SECRETO_ANTERIOR + " es igual a " + VARIABLE_SECRETO
                        + ": en una rotacion lleva el secreto viejo, y fuera de una rotacion va vacia.");
            }
            aceptados.add(anterior);
        }
        this.secretosAceptados = List.copyOf(aceptados);
        this.objectMapper = objectMapper;
    }

    /** El nombre del encabezado que se exige (no es secreto). */
    public String encabezado() {
        return encabezado;
    }

    /** Si hay una rotacion en curso: se acepta tambien el secreto anterior. */
    public boolean aceptaSecretoAnterior() {
        return secretosAceptados.size() > 1;
    }

    static String validarEncabezado(String encabezado) {
        if (encabezado == null || !NOMBRE_DE_ENCABEZADO.matcher(encabezado).matches()) {
            throw new IllegalStateException(("app.origen.encabezado debe ser un nombre de encabezado HTTP, solo con"
                    + " letras, digitos y guiones: '%s'.").formatted(encabezado));
        }
        return encabezado;
    }

    /**
     * Valida un secreto y devuelve sus bytes. Los mensajes nombran la variable
     * y la regla incumplida, nunca el valor ni su longitud.
     */
    static byte[] validarSecreto(String variable, String secreto) {
        String apagado = VARIABLE_SECRETO.equals(variable)
                ? " Para apagar la validacion a proposito, " + VARIABLE_SECRETO + "=ninguno."
                : "";
        if (secreto == null || secreto.isEmpty()) {
            throw new IllegalStateException(variable + " esta vacia." + apagado + COMO_GENERARLO);
        }
        if (secreto.length() < LONGITUD_MINIMA) {
            throw new IllegalStateException(variable + " es demasiado corto: se exigen al menos " + LONGITUD_MINIMA
                    + " caracteres." + apagado + COMO_GENERARLO);
        }
        // ASCII visible (0x21-0x7E): sin espacios ni saltos de linea, que se
        // pierden al pegar o al viajar en un encabezado y dejarian el API
        // respondiendo 403 a todo.
        if (!secreto.chars().allMatch(c -> c >= 0x21 && c <= 0x7E)) {
            throw new IllegalStateException(variable + " solo admite caracteres ASCII visibles, sin espacios ni"
                    + " saltos de linea." + COMO_GENERARLO);
        }
        return secreto.getBytes(StandardCharsets.US_ASCII);
    }

    /**
     * {@code GET /actuator/health} exacto, comparando la URI cruda (sin
     * decodificar ni normalizar): cualquier variante ({@code HEAD},
     * {@code /actuator/health/db}, {@code /actuator/health/},
     * {@code /actuator/%68ealth}) queda del lado que exige el encabezado.
     *
     * <p>Se compara contra {@code contextPath + ruta}, no contra la ruta
     * sola: el {@code ForwardedHeaderFilter} de {@code prod} tiene la misma
     * precedencia y puede correr antes. Si ese filtro aplica un
     * {@code X-Forwarded-Prefix}, cambia el context path y la URI juntos, y
     * la comparacion sigue siendo sobre la ruta que despacha Spring.</p>
     */
    static boolean esHealthcheck(HttpServletRequest request) {
        return HttpMethod.GET.matches(request.getMethod())
                && (request.getContextPath() + RUTA_HEALTHCHECK).equals(request.getRequestURI());
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        return esHealthcheck(request);
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        if (traeUnSecretoAceptado(request.getHeader(encabezado))) {
            filterChain.doFilter(request, response);
            return;
        }
        // Ni el valor recibido ni si faltaba o no coincidia: en INFO, un
        // escaneo llenaria el log; en DEBUG sirve para diagnosticar en local.
        log.debug("403 por el encabezado de origen: {} {}", request.getMethod(), request.getRequestURI());
        rechazar(request, response);
    }

    private boolean traeUnSecretoAceptado(String valor) {
        if (valor == null) {
            return false;
        }
        // UTF-8: un caracter no ASCII nunca coincide con el secreto (ASCII).
        byte[] recibido = valor.getBytes(StandardCharsets.UTF_8);
        boolean aceptado = false;
        for (byte[] secreto : secretosAceptados) {
            aceptado |= MessageDigest.isEqual(secreto, recibido);
        }
        return aceptado;
    }

    /** El mismo cuerpo que {@code RestAccessDeniedHandler} para un 403 cualquiera. */
    private void rechazar(HttpServletRequest request, HttpServletResponse response) throws IOException {
        ApiError cuerpo = ApiError.of(HttpStatus.FORBIDDEN.value(), HttpStatus.FORBIDDEN.getReasonPhrase(),
                "Acceso denegado", request.getRequestURI(), List.of());
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), cuerpo);
    }
}
