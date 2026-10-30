package pe.edu.upc.viasegura.moderacion.infra;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.concurrent.CancellationException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
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
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PuntajeDeModeracion;
import pe.edu.upc.viasegura.moderacion.port.ModeracionNoDisponibleException;
import pe.edu.upc.viasegura.moderacion.port.ModeradorDeImagen;

/**
 * Moderador real (NC-10b, D-15): {@code POST /v1/moderacion} del servicio
 * {@code inferencia/} (Marqo {@code nsfw-image-detection-384}), segun el
 * contrato {@code project-context/handoffs/2026-10-28-contrato-moderacion-v1.md}
 * y ARCHITECTURE.md §6 y §7. Se activa con {@code app.moderacion.tipo=http}
 * ({@code MODERACION_TIPO=http}); la URL base del servicio, sin la ruta, es
 * {@code app.moderacion.http.url} ({@code MODERACION_URL}).
 *
 * <p>Sigue el patron de {@code clasificacion/infra/InferenciaHttpAdapter}
 * (NC-04b), que vive en otro modulo y no se puede reutilizar
 * (ARCHITECTURE.md §4.3: nadie usa el {@code infra} de otro modulo):</p>
 * <ul>
 *   <li>{@link RestClient} sobre el {@link HttpClient} del JDK, con
 *       <b>HTTP/1.1 explicito</b> (uvicorn no habla el {@code h2c} que
 *       intentaria el cliente) y sin dependencias nuevas;</li>
 *   <li>{@value #MS_CONEXION} ms para conectar y {@value #MS_LECTURA} ms de
 *       lectura, <b>sin reintentos</b>;</li>
 *   <li>la respuesta se valida solo por su estructura;</li>
 *   <li>cada llamada deja una linea de log con su duracion.</li>
 * </ul>
 *
 * <p><b>Turno ({@code bulkhead}).</b> A lo sumo
 * {@value #LLAMADAS_SIMULTANEAS} llamadas a la vez, con un {@link Semaphore}
 * propio, aparte del de la deteccion: el servicio responde 503 desde 10
 * conexiones abiertas <b>sumando los dos endpoints</b>, y los dos turnos del
 * backend suman 4 + 4 = 8 (handoff, «Tope de conexiones»). Como cada llamada
 * usa una conexion HTTP/1.1 a la vez, el semaforo acota tambien las que
 * quedan en keep-alive. Segun el {@link OrigenDeModeracion}:</p>
 * <ul>
 *   <li>la <b>creacion</b> espera un turno hasta {@value #MS_ESPERA_CREACION}
 *       ms: sin turno, el ciudadano recibiria un 503, no «sin sugerencia»;</li>
 *   <li>la <b>vista previa</b> no espera: sin turno, la foto queda sin revisar
 *       y el veredicto oficial es el de la creacion.</li>
 * </ul>
 *
 * <p><b>Errores.</b> Cualquier cosa distinta de un 200 que cumpla el contrato
 * (un 4xx, un 5xx, el 503 de uvicorn, un timeout, un error de conexion o un
 * 200 fuera del contrato) se traduce a {@link ModeracionNoDisponibleException}.
 * El nivel del log separa las causas: {@code WARN} para 5xx, 503, timeout o
 * sin conexion (problemas pasajeros del servicio) y {@code ERROR} para un 4xx
 * o un 200 fuera del contrato (la foto llega saneada, asi que es un defecto de
 * un lado del contrato, no una caida).</p>
 *
 * <p><b>La respuesta se valida solo por su estructura:</b> fuera de contrato
 * si falta {@code version_modelo} o {@code puntaje}, si los tipos no son los
 * del contrato, si el puntaje no es finito o esta fuera de [0, 1], o si la
 * version pasa de {@value PuntajeDeModeracion#VERSION_MODELO_MAX} caracteres.
 * Los campos desconocidos se ignoran.</p>
 *
 * <p><b>El log no lleva el puntaje de una foto aceptada</b> (solo la duracion
 * y la version): no se guarda, es una senal interna. El de una rechazada lo
 * deja {@code ModeracionService}, redondeado. La foto viaja saneada (sin
 * EXIF) y con un nombre fijo, nunca el del archivo original.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.moderacion.tipo", havingValue = "http")
public class InferenciaModeracionHttpAdapter implements ModeradorDeImagen {

    static final String RUTA = "/v1/moderacion";
    static final String PARTE = "imagen";
    static final String NOMBRE_ARCHIVO = "foto.jpg";
    static final int LLAMADAS_SIMULTANEAS = 4;
    static final long MS_CONEXION = 500;
    static final long MS_LECTURA = 2_500;
    /** Cuanto espera la creacion un turno (decision del usuario del 28/10). */
    static final long MS_ESPERA_CREACION = 1_000;

    /** Del cuerpo de un error se copia al log solo un {@code codigo} con esta forma. */
    private static final Pattern CODIGO_DE_ERROR = Pattern.compile("[a-z0-9_]{1,64}");
    /** Lo que se lee del cuerpo de una respuesta de error: basta para el {@code codigo}. */
    private static final int MAX_BYTES_ERROR = 4_096;
    /** Tope del cuerpo de un 200: el del contrato ocupa menos de 100 bytes. */
    static final int MAX_BYTES_RESPUESTA = 16 * 1_024;
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private final RestClient restClient;
    private final URI url;
    private final Semaphore turnos = new Semaphore(LLAMADAS_SIMULTANEAS);
    private final Duration esperaCreacion;

    @Autowired
    public InferenciaModeracionHttpAdapter(@Value("${app.moderacion.http.url:}") String urlBase) {
        this(RestClient.builder().requestFactory(fabrica(Duration.ofMillis(MS_CONEXION), Duration.ofMillis(MS_LECTURA))),
                urlBase, Duration.ofMillis(MS_ESPERA_CREACION));
        log.info("Moderador HTTP: {} (timeout {} + {} ms, {} llamadas a la vez; la creacion espera turno hasta {} ms)",
                url, MS_CONEXION, MS_LECTURA, LLAMADAS_SIMULTANEAS, MS_ESPERA_CREACION);
    }

    /** Con otros timeouts: los tests del timeout real contra un socket local. */
    InferenciaModeracionHttpAdapter(String urlBase, Duration timeoutConexion, Duration timeoutLectura) {
        this(RestClient.builder().requestFactory(fabrica(timeoutConexion, timeoutLectura)), urlBase,
                Duration.ofMillis(MS_ESPERA_CREACION));
    }

    /**
     * Con un {@link RestClient.Builder} ya preparado (los tests lo atan a
     * {@code MockRestServiceServer}) y otra espera de la creacion. No toca su
     * {@code requestFactory}.
     */
    InferenciaModeracionHttpAdapter(RestClient.Builder builder, String urlBase, Duration esperaCreacion) {
        this.url = urlModeracion(urlBase);
        this.esperaCreacion = esperaCreacion;
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

    /** {@code MODERACION_URL} es la base ({@code http://host:8000}); la ruta la pone el adaptador. */
    static URI urlModeracion(String urlBase) {
        if (!StringUtils.hasText(urlBase)) {
            throw new IllegalStateException("Con MODERACION_TIPO=http falta MODERACION_URL"
                    + " (app.moderacion.http.url): la URL base del servicio de inferencia");
        }
        String base = urlBase.strip();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return URI.create(base + RUTA);
    }

    /** Si el servicio esta caido, se nota al llamarlo: no se adivina antes. */
    @Override
    public boolean estaActivo() {
        return true;
    }

    @Override
    public PuntajeDeModeracion medir(FotoSaneada foto, OrigenDeModeracion origen) {
        if (foto == null) {
            throw new ModeracionNoDisponibleException("Sin foto: no hay nada que moderar");
        }
        tomarTurno(origen);
        try {
            return llamar(foto);
        } finally {
            turnos.release();
        }
    }

    /**
     * Toma un turno o lanza «no disponible»: la vista previa no espera; la
     * creacion espera hasta {@link #esperaCreacion}. Si el hilo se interrumpe
     * mientras espera, se rinde y conserva la interrupcion.
     */
    private void tomarTurno(OrigenDeModeracion origen) {
        if (origen != OrigenDeModeracion.CREACION) {
            if (!turnos.tryAcquire()) {
                log.warn("Moderacion: sin turno para la vista previa, {} llamadas en curso (sin revisar)",
                        LLAMADAS_SIMULTANEAS);
                throw sinTurno();
            }
            return;
        }
        long inicio = System.nanoTime();
        boolean conTurno;
        try {
            conTurno = turnos.tryAcquire(esperaCreacion.toNanos(), TimeUnit.NANOSECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Moderacion: la creacion se interrumpio esperando turno tras {} ms", msDesde(inicio));
            throw new ModeracionNoDisponibleException("Interrumpida mientras esperaba turno para la moderacion");
        }
        long ms = msDesde(inicio);
        if (!conTurno) {
            log.warn("Moderacion: la creacion espero {} ms sin turno, {} llamadas en curso", ms,
                    LLAMADAS_SIMULTANEAS);
            throw sinTurno();
        }
        if (ms > 0) {
            log.info("Moderacion: la creacion espero {} ms por un turno", ms);
        }
    }

    private static ModeracionNoDisponibleException sinTurno() {
        return new ModeracionNoDisponibleException(
                "Sin turno para la moderacion: " + LLAMADAS_SIMULTANEAS + " llamadas en curso");
    }

    private PuntajeDeModeracion llamar(FotoSaneada foto) {
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
            log.warn("Moderacion: sin respuesta en {} ms ({}): timeout o sin conexion", msDesde(inicio), causa);
            throw new ModeracionNoDisponibleException(
                    "La moderacion no respondio a tiempo o no se pudo conectar (" + causa + ")");
        } catch (CancellationException e) {
            // Spring 6.2 corta la lectura cancelando el futuro del HttpClient del
            // JDK; segun el momento, llega asi y no como ResourceAccessException.
            log.warn("Moderacion: sin respuesta en {} ms (Timeout de lectura: el pedido se cancelo)",
                    msDesde(inicio));
            throw new ModeracionNoDisponibleException(
                    "La moderacion no respondio a tiempo (Timeout de lectura, pedido cancelado)");
        } catch (RestClientException e) {
            log.warn("Moderacion: error del cliente HTTP en {} ms ({})", msDesde(inicio),
                    e.getClass().getSimpleName());
            throw new ModeracionNoDisponibleException(
                    "Error al llamar a la moderacion (" + e.getClass().getSimpleName() + ")");
        }
        long ms = msDesde(inicio);
        int status = respuesta.status();
        if (status == 200) {
            return interpretar(respuesta, ms);
        }
        String codigo = codigoDeError(respuesta.cuerpo());
        if (status == 503) {
            log.warn("Moderacion: servicio saturado, HTTP 503 en {} ms", ms);
            throw new ModeracionNoDisponibleException("La moderacion esta saturada (HTTP 503)");
        }
        if (status >= 500) {
            log.warn("Moderacion: error del servicio, HTTP {}{} en {} ms", status, codigo, ms);
            throw new ModeracionNoDisponibleException("La moderacion fallo (HTTP " + status + codigo + ")");
        }
        if (status >= 400) {
            log.error("Moderacion: pedido rechazado, HTTP {}{} en {} ms: la foto saneada o el adaptador no"
                    + " cumplen el contrato /v1", status, codigo, ms);
            throw new ModeracionNoDisponibleException(
                    "La moderacion rechazo la foto (HTTP " + status + codigo + ")");
        }
        log.warn("Moderacion: respuesta inesperada, HTTP {} en {} ms", status, ms);
        throw new ModeracionNoDisponibleException("La moderacion respondio HTTP " + status + ", no 200");
    }

    private PuntajeDeModeracion interpretar(Respuesta respuesta, long ms) {
        PuntajeDeModeracion puntaje;
        try {
            if (respuesta.excedida()) {
                throw new RespuestaFueraDeContrato("el cuerpo pasa de " + MAX_BYTES_RESPUESTA + " bytes");
            }
            puntaje = leerContrato(respuesta.cuerpo());
        } catch (RespuestaFueraDeContrato e) {
            log.error("Moderacion: 200 en {} ms fuera del contrato /v1: {}", ms, e.getMessage());
            throw new ModeracionNoDisponibleException("La moderacion respondio fuera del contrato: "
                    + e.getMessage());
        }
        log.info("Moderacion: 200 en {} ms, modelo {}", ms, puntaje.versionModelo());
        return puntaje;
    }

    /** La foto saneada en la parte {@code imagen}, con un nombre fijo y como JPEG (la salida del saneado). */
    private static Object partes(FotoSaneada foto) {
        MultipartBodyBuilder partes = new MultipartBodyBuilder();
        partes.part(PARTE, new ByteArrayResource(foto.contenido()))
                .filename(NOMBRE_ARCHIVO)
                .contentType(MediaType.IMAGE_JPEG);
        return partes.build();
    }

    /**
     * Lee una respuesta 200 del contrato {@code /v1/moderacion}, mirando solo su
     * estructura (ver la cabecera de la clase).
     *
     * @throws RespuestaFueraDeContrato si no es un JSON con la forma del contrato
     */
    static PuntajeDeModeracion leerContrato(byte[] cuerpo) {
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
        if (versionModelo.isBlank() || versionModelo.length() > PuntajeDeModeracion.VERSION_MODELO_MAX) {
            throw new RespuestaFueraDeContrato("version_modelo vacia o de mas de "
                    + PuntajeDeModeracion.VERSION_MODELO_MAX + " caracteres (" + versionModelo.length() + ")");
        }
        JsonNode puntaje = raiz.get("puntaje");
        if (puntaje == null || !puntaje.isNumber()) {
            throw new RespuestaFueraDeContrato("falta puntaje o no es un numero");
        }
        double valor = puntaje.doubleValue();
        if (!Double.isFinite(valor) || valor < 0 || valor > 1) {
            throw new RespuestaFueraDeContrato("puntaje fuera de [0, 1]");
        }
        return new PuntajeDeModeracion(versionModelo, valor);
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

    /** Un 200 que no cumple la estructura del contrato {@code /v1/moderacion}. */
    static final class RespuestaFueraDeContrato extends RuntimeException {

        RespuestaFueraDeContrato(String motivo) {
            super(motivo);
        }
    }
}
