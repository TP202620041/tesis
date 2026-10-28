package pe.edu.upc.viasegura.clasificacion.infra;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import pe.edu.upc.viasegura.clasificacion.domain.Deteccion;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.clasificacion.port.ClasificacionNoDisponibleException;
import pe.edu.upc.viasegura.clasificacion.port.ClasificadorDano;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;

/**
 * Clasificador real (NC-04b): {@code POST /v1/detecciones} del servicio
 * {@code inferencia/} (RF-DETR Nano), segun el contrato
 * {@code project-context/handoffs/2026-10-25-contrato-inferencia-v1.md} y
 * ARCHITECTURE.md §6 y §7. Se activa con {@code app.clasificacion.tipo=http}
 * ({@code CLASIFICACION_TIPO=http}); la URL base del servicio, sin la ruta,
 * es {@code app.clasificacion.http.url} ({@code CLASIFICACION_URL}).
 *
 * <p><b>Conexion.</b> {@link RestClient} sobre el {@link HttpClient} del JDK,
 * como {@code ResendCorreoAdapter}: sin dependencias nuevas. Con
 * <b>HTTP/1.1 explicito</b>: por defecto el cliente del JDK intenta HTTP/2 y,
 * sobre {@code http://}, lo negocia con un {@code Upgrade: h2c} que uvicorn no
 * habla. Con HTTP/1.1 cada conexion lleva una llamada a la vez, asi que las
 * conexiones abiertas (tambien las que quedan en keep-alive) nunca pasan de
 * las llamadas simultaneas, que acota el turno de abajo. El multipart se
 * escribe en streaming, asi que el pedido va <b>en chunks</b>
 * ({@code Transfer-Encoding: chunked}, sin {@code Content-Length}): uvicorn
 * los acepta, y el limite de cuerpo del servicio cuenta los bytes que
 * recibe, no solo el {@code Content-Length} declarado.</p>
 *
 * <p><b>Tiempos.</b> {@value #MS_CONEXION} ms para conectar y
 * {@value #MS_LECTURA} ms de lectura: suman 3 s como maximo, el tope de la
 * vista previa (el ciudadano espera la sugerencia mientras arma el reporte).
 * La conexion es por la red privada y tarda milisegundos; la lectura se lleva
 * casi todo porque incluye la espera en el servicio, que infiere de a una
 * imagen: con las {@value #LLAMADAS_SIMULTANEAS} llamadas del turno en curso,
 * la ultima espera a las otras tres (unos 1,6 s con los 0,4 s por foto medidos
 * en NC-03a). En Spring 6.2 la lectura se cuenta desde que sale el pedido
 * hasta cerrar el cuerpo de la respuesta, asi que tambien cubre una respuesta
 * que llega a medias.</p>
 *
 * <p><b>Turno ({@code bulkhead}).</b> A lo sumo {@value #LLAMADAS_SIMULTANEAS}
 * llamadas a la vez, con un {@link Semaphore} que <b>no espera</b>: sin turno
 * la respuesta es «sin sugerencia» al instante. Hace falta porque el cliente
 * del JDK no limita sus conexiones y el servicio responde 503 desde 10
 * conexiones o tareas abiertas, contando las de keep-alive. Las llamadas
 * llegan de dos lados y <b>compiten por los mismos turnos</b>:</p>
 * <ul>
 *   <li>la sugerencia oficial, en los hilos del executor asincrono: en la
 *       practica los {@code ASYNC_HILOS_BASE} (2), porque el pool solo crece
 *       hacia {@code ASYNC_HILOS_MAX} (4) con su cola de 100 tareas llena, y
 *       esos hilos tambien envian correos y avisos;</li>
 *   <li>las vistas previas en curso, una por ciudadano con la pantalla
 *       abierta: el turno propio de la vista previa
 *       ({@code ClasificacionService}) solo acota el saneado y se suelta antes
 *       de llamar aqui, asi que varias pueden estar clasificando a la vez.</li>
 * </ul>
 * <p>Con los dos hilos base clasificando quedan dos turnos para vistas
 * previas. El tope protege al servicio; no reserva turnos para nadie. La
 * llamada que llega sin turno da «sin sugerencia», sea una vista previa (el
 * ciudadano elige a mano) o una sugerencia oficial: esa <b>se pierde</b>, porque
 * las columnas quedan nulas y no se reintenta, y la foto cuenta como «sin
 * sugerencia» en la evaluacion del modelo (OE3).</p>
 *
 * <p><b>Errores y reintentos.</b> Cualquier respuesta distinta de 200, un
 * timeout o un error de conexion se traducen a
 * {@link ClasificacionNoDisponibleException} («sin sugerencia»), <b>sin
 * reintentos</b>: la IA nunca bloquea un reporte (§4.3) y un reintento solo
 * cargaria mas a un servicio que ya no respondio. Cada llamada deja una linea
 * en el log con su resultado y su <b>duracion</b> (la medida de latencia de
 * DEP-13), con un nivel que separa las causas:</p>
 * <ul>
 *   <li>{@code INFO}: 200;</li>
 *   <li>{@code WARN}: 5xx, 503 (servicio saturado), timeout o sin conexion:
 *       problemas del servicio, pasajeros;</li>
 *   <li>{@code ERROR}: 4xx o un 200 fuera del contrato. La foto llega saneada
 *       (JPEG de 2048 px o menos), asi que el servicio no deberia rechazarla:
 *       es un defecto de un lado del contrato, no una caida.</li>
 * </ul>
 * <p>Del cuerpo de un error solo se copia el {@code codigo} del contrato
 * ({@code imagen_invalida}...), y solo si tiene forma de codigo.</p>
 *
 * <p><b>La respuesta se valida solo por su estructura.</b> Se rechaza entera
 * si falta {@code version_modelo} o {@code detecciones}, si los tipos no son
 * los del contrato o si {@code version_modelo} pasa de
 * {@value ResultadoDeteccion#VERSION_MODELO_MAX} caracteres (la columna
 * {@code reporte.version_modelo_sugerencia}). Se ignoran {@code caja} y los
 * campos desconocidos. Una clase desconocida o una confianza fuera de [0, 1]
 * <b>no</b> invalidan la respuesta: las descarta
 * {@link pe.edu.upc.viasegura.clasificacion.domain.PoliticaDeSugerencia}, y
 * las demas detecciones de la foto siguen valiendo.</p>
 *
 * <p><b>La foto viaja sin datos del ciudadano</b>: la parte {@code imagen}
 * lleva la foto saneada (sin EXIF) con un nombre fijo, nunca el nombre del
 * archivo original.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.clasificacion.tipo", havingValue = "http")
public class InferenciaHttpAdapter implements ClasificadorDano {

    static final String RUTA = "/v1/detecciones";
    static final String PARTE = "imagen";
    static final String NOMBRE_ARCHIVO = "foto.jpg";
    static final int LLAMADAS_SIMULTANEAS = 4;
    static final long MS_CONEXION = 500;
    static final long MS_LECTURA = 2_500;

    /** Del cuerpo de un error se copia al log solo un {@code codigo} con esta forma. */
    private static final Pattern CODIGO_DE_ERROR = Pattern.compile("[a-z0-9_]{1,64}");
    /** Lo que se lee del cuerpo de una respuesta de error: basta para el {@code codigo}. */
    private static final int MAX_BYTES_ERROR = 4_096;
    /**
     * Tope del cuerpo de un 200: 100 detecciones caben en unos 10 KB. Uno mas
     * grande no es del contrato y no se carga entero en memoria.
     */
    static final int MAX_BYTES_RESPUESTA = 256 * 1_024;
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private final RestClient restClient;
    private final URI url;
    private final Semaphore turnos = new Semaphore(LLAMADAS_SIMULTANEAS);

    @Autowired
    public InferenciaHttpAdapter(@Value("${app.clasificacion.http.url:}") String urlBase) {
        this(urlBase, Duration.ofMillis(MS_CONEXION), Duration.ofMillis(MS_LECTURA));
        log.info("Clasificador HTTP: {} (timeout {} + {} ms, {} llamadas a la vez)", url, MS_CONEXION,
                MS_LECTURA, LLAMADAS_SIMULTANEAS);
    }

    /** Con otros timeouts: los tests del timeout real contra un socket local. */
    InferenciaHttpAdapter(String urlBase, Duration timeoutConexion, Duration timeoutLectura) {
        this(RestClient.builder().requestFactory(fabrica(timeoutConexion, timeoutLectura)), urlBase);
    }

    /**
     * Con un {@link RestClient.Builder} ya preparado: los tests lo atan a
     * {@code MockRestServiceServer}. No toca su {@code requestFactory}.
     */
    InferenciaHttpAdapter(RestClient.Builder builder, String urlBase) {
        this.url = urlDetecciones(urlBase);
        this.restClient = builder.build();
    }

    private static JdkClientHttpRequestFactory fabrica(Duration conexion, Duration lectura) {
        HttpClient cliente = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(conexion)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        JdkClientHttpRequestFactory fabrica = new JdkClientHttpRequestFactory(cliente);
        fabrica.setReadTimeout(lectura);
        return fabrica;
    }

    /** {@code CLASIFICACION_URL} es la base ({@code http://host:8000}); la ruta la pone el adaptador. */
    static URI urlDetecciones(String urlBase) {
        if (!StringUtils.hasText(urlBase)) {
            throw new IllegalStateException("Con CLASIFICACION_TIPO=http falta CLASIFICACION_URL"
                    + " (app.clasificacion.http.url): la URL base del servicio de inferencia");
        }
        String base = urlBase.strip();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return URI.create(base + RUTA);
    }

    /** Si el servicio esta caido, se nota al llamarlo: no se adivina antes. */
    @Override
    public boolean estaDisponible() {
        return true;
    }

    @Override
    public ResultadoDeteccion detectar(ArchivoSubido foto) {
        if (foto == null || foto.vacio()) {
            throw new ClasificacionNoDisponibleException("Foto vacia: no hay nada que clasificar");
        }
        if (!turnos.tryAcquire()) {
            log.warn("Inferencia: sin turno, {} llamadas en curso (sin sugerencia)", LLAMADAS_SIMULTANEAS);
            throw new ClasificacionNoDisponibleException(
                    "Sin turno para la inferencia: " + LLAMADAS_SIMULTANEAS + " llamadas en curso");
        }
        try {
            return llamar(foto);
        } finally {
            turnos.release();
        }
    }

    private ResultadoDeteccion llamar(ArchivoSubido foto) {
        long inicio = System.nanoTime();
        Respuesta respuesta;
        try {
            respuesta = restClient.post()
                    .uri(url)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(partes(foto))
                    .exchange((pedido, r) -> Respuesta.leer(r.getStatusCode().value(), r.getBody()));
        } catch (ResourceAccessException e) {
            String causa = NestedExceptionUtils.getMostSpecificCause(e).getClass().getSimpleName();
            long ms = msDesde(inicio);
            log.warn("Inferencia: sin respuesta en {} ms ({}): timeout o sin conexion", ms, causa);
            throw new ClasificacionNoDisponibleException(
                    "La inferencia no respondio a tiempo o no se pudo conectar (" + causa + ")");
        } catch (RestClientException e) {
            long ms = msDesde(inicio);
            log.warn("Inferencia: error del cliente HTTP en {} ms ({})", ms, e.getClass().getSimpleName());
            throw new ClasificacionNoDisponibleException(
                    "Error al llamar a la inferencia (" + e.getClass().getSimpleName() + ")");
        }
        long ms = msDesde(inicio);
        int status = respuesta.status();
        if (status == 200) {
            return interpretar(respuesta, ms);
        }
        String codigo = codigoDeError(respuesta.cuerpo());
        if (status == 503) {
            log.warn("Inferencia: servicio saturado, HTTP 503 en {} ms", ms);
            throw new ClasificacionNoDisponibleException("La inferencia esta saturada (HTTP 503)");
        }
        if (status >= 500) {
            log.warn("Inferencia: error del servicio, HTTP {}{} en {} ms", status, codigo, ms);
            throw new ClasificacionNoDisponibleException("La inferencia fallo (HTTP " + status + codigo + ")");
        }
        if (status >= 400) {
            log.error("Inferencia: pedido rechazado, HTTP {}{} en {} ms: la foto saneada o el adaptador no"
                    + " cumplen el contrato /v1", status, codigo, ms);
            throw new ClasificacionNoDisponibleException(
                    "La inferencia rechazo la foto (HTTP " + status + codigo + ")");
        }
        log.warn("Inferencia: respuesta inesperada, HTTP {} en {} ms", status, ms);
        throw new ClasificacionNoDisponibleException("La inferencia respondio HTTP " + status + ", no 200");
    }

    private ResultadoDeteccion interpretar(Respuesta respuesta, long ms) {
        ResultadoDeteccion resultado;
        try {
            if (respuesta.excedida()) {
                throw new RespuestaFueraDeContrato("el cuerpo pasa de " + MAX_BYTES_RESPUESTA + " bytes");
            }
            resultado = leerContrato(respuesta.cuerpo());
        } catch (RespuestaFueraDeContrato e) {
            log.error("Inferencia: 200 en {} ms fuera del contrato /v1: {}", ms, e.getMessage());
            throw new ClasificacionNoDisponibleException("La inferencia respondio fuera del contrato: "
                    + e.getMessage());
        }
        log.info("Inferencia: 200 en {} ms, {} deteccion(es), modelo {}", ms, resultado.detecciones().size(),
                resultado.versionModelo());
        return resultado;
    }

    /** La foto saneada en la parte {@code imagen}, con un nombre fijo y como JPEG (la salida del saneado). */
    private static Object partes(ArchivoSubido foto) {
        MultipartBodyBuilder partes = new MultipartBodyBuilder();
        partes.part(PARTE, new ByteArrayResource(foto.contenido()))
                .filename(NOMBRE_ARCHIVO)
                .contentType(MediaType.IMAGE_JPEG);
        return partes.build();
    }

    /**
     * Lee una respuesta 200 del contrato {@code /v1}, mirando solo su
     * estructura (ver la cabecera de la clase).
     *
     * @throws RespuestaFueraDeContrato si no es un JSON con la forma del contrato
     */
    static ResultadoDeteccion leerContrato(byte[] cuerpo) {
        JsonNode raiz;
        try {
            raiz = JSON.readTree(cuerpo);
        } catch (IOException e) {
            throw new RespuestaFueraDeContrato("el cuerpo no es JSON valido");
        }
        if (raiz == null || !raiz.isObject()) {
            throw new RespuestaFueraDeContrato("el cuerpo no es un objeto JSON");
        }
        JsonNode version = raiz.get("version_modelo");
        if (version == null || !version.isTextual()) {
            throw new RespuestaFueraDeContrato("falta version_modelo o no es texto");
        }
        String versionModelo = version.textValue();
        if (versionModelo.isBlank() || versionModelo.length() > ResultadoDeteccion.VERSION_MODELO_MAX) {
            throw new RespuestaFueraDeContrato("version_modelo vacia o de mas de "
                    + ResultadoDeteccion.VERSION_MODELO_MAX + " caracteres (" + versionModelo.length() + ")");
        }
        JsonNode detecciones = raiz.get("detecciones");
        if (detecciones == null || !detecciones.isArray()) {
            throw new RespuestaFueraDeContrato("falta detecciones o no es una lista");
        }
        List<Deteccion> lista = new ArrayList<>(detecciones.size());
        for (JsonNode deteccion : detecciones) {
            JsonNode clase = deteccion.get("clase");
            JsonNode confianza = deteccion.get("confianza");
            if (!deteccion.isObject() || clase == null || !clase.isTextual()
                    || confianza == null || !confianza.isNumber()) {
                throw new RespuestaFueraDeContrato(
                        "una deteccion no tiene clase de texto y confianza numerica");
            }
            lista.add(new Deteccion(clase.textValue(), confianza.doubleValue()));
        }
        return new ResultadoDeteccion(versionModelo, lista);
    }

    /** {@code ", imagen_invalida"} si el cuerpo trae un {@code codigo} con forma de codigo; si no, vacio. */
    private static String codigoDeError(byte[] cuerpo) {
        try {
            JsonNode error = JSON.readTree(cuerpo);
            String codigo = error == null ? null : error.path("codigo").asText(null);
            return codigo != null && CODIGO_DE_ERROR.matcher(codigo).matches() ? ", " + codigo : "";
        } catch (IOException | RuntimeException ilegible) {
            return ""; // el 503 de uvicorn es texto plano
        }
    }

    private static long msDesde(long inicio) {
        return Duration.ofNanos(System.nanoTime() - inicio).toMillis();
    }

    /**
     * Status y cuerpo, leidos dentro del {@code exchange} (que cierra la
     * respuesta al volver), con un tope: {@code excedida} si un 200 pasa de
     * {@link #MAX_BYTES_RESPUESTA}.
     */
    private record Respuesta(int status, byte[] cuerpo, boolean excedida) {

        static Respuesta leer(int status, InputStream cuerpo) throws IOException {
            if (cuerpo == null) {
                return new Respuesta(status, new byte[0], false);
            }
            if (status != 200) {
                return new Respuesta(status, cuerpo.readNBytes(MAX_BYTES_ERROR), false);
            }
            byte[] bytes = cuerpo.readNBytes(MAX_BYTES_RESPUESTA + 1);
            return new Respuesta(status, bytes, bytes.length > MAX_BYTES_RESPUESTA);
        }
    }

    /** Un 200 que no cumple la estructura del contrato {@code /v1}. */
    static final class RespuestaFueraDeContrato extends RuntimeException {

        RespuestaFueraDeContrato(String motivo) {
            super(motivo);
        }
    }
}
