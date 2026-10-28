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
import pe.edu.upc.viasegura.clasificacion.domain.Deteccion;
import pe.edu.upc.viasegura.clasificacion.domain.OrigenDeConsulta;
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
 * llamadas a la vez, con un {@link Semaphore}. Hace falta porque el cliente
 * del JDK no limita sus conexiones y el servicio responde 503 desde 10
 * conexiones o tareas abiertas, contando las de keep-alive. Las llamadas
 * llegan de dos lados y <b>compiten por los mismos turnos</b>, pero no los
 * esperan igual (NC-04c, decision del usuario del 28/10, segun el
 * {@link OrigenDeConsulta}):</p>
 * <ul>
 *   <li>las <b>vistas previas</b> en curso, una por ciudadano con la pantalla
 *       abierta, <b>no esperan</b>: sin turno, «sin sugerencia» al instante y
 *       el ciudadano elige a mano. El turno propio de la vista previa
 *       ({@code ClasificacionService}) solo acota el saneado y se suelta antes
 *       de llamar aqui, asi que varias pueden estar clasificando a la vez;</li>
 *   <li>la <b>sugerencia oficial</b> espera un turno hasta
 *       {@code app.clasificacion.http.espera-turno-oficial-ms}
 *       ({@code CLASIFICACION_ESPERA_TURNO_MS}, 10 s por defecto): es
 *       asincrona y no hace esperar a nadie, y sin turno se perderia (las
 *       columnas quedan nulas y no se reintenta, y la foto contaria como «sin
 *       sugerencia» en la evaluacion del modelo, OE3). Si en ese plazo no se
 *       libera ninguno, se rinde: «sin sugerencia», como antes. Corre en el
 *       executor propio de las sugerencias ({@code AsyncConfig}, 2 hilos),
 *       asi que esperar no retrasa correos ni avisos, y a lo sumo 2 llamadas
 *       oficiales toman turno a la vez: quedan dos para las vistas
 *       previas.</li>
 * </ul>
 * <p>El tope protege al servicio; no reserva turnos para nadie. Un turno que
 * se libera mientras una sugerencia oficial espera puede tomarlo antes una
 * vista previa que llega en ese momento (el semaforo no es justo, y la vista
 * previa sigue igual que antes); la oficial sigue esperando hasta su plazo.
 * Ninguna espera puede pasar del plazo: como mucho, la sugerencia oficial
 * tarda la espera mas los 3 s de la llamada.</p>
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

    /** NC-04c: cuanto espera la sugerencia oficial un turno, por defecto (decision del usuario del 28/10). */
    static final long MS_ESPERA_OFICIAL_POR_DEFECTO = 10_000;
    /**
     * Tope de esa espera: mientras espera, ocupa uno de los hilos de las
     * sugerencias. Un valor mayor seria un error de configuracion.
     */
    static final long MS_ESPERA_OFICIAL_MAXIMA = 60_000;
    static final String PROPIEDAD_ESPERA_OFICIAL = "app.clasificacion.http.espera-turno-oficial-ms";
    /** Los hilos del executor de las sugerencias ({@code AsyncConfig}): cada uno puede tener un turno. */
    static final String PROPIEDAD_HILOS_SUGERENCIAS = "app.async.sugerencias.hilos";

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
    private final Duration esperaOficial;

    @Autowired
    public InferenciaHttpAdapter(
            @Value("${app.clasificacion.http.url:}") String urlBase,
            @Value("${" + PROPIEDAD_ESPERA_OFICIAL + ":" + MS_ESPERA_OFICIAL_POR_DEFECTO + "}") long msEsperaOficial,
            @Value("${" + PROPIEDAD_HILOS_SUGERENCIAS + ":2}") int hilosDeSugerencias) {
        this(RestClient.builder().requestFactory(
                        fabrica(Duration.ofMillis(MS_CONEXION), Duration.ofMillis(MS_LECTURA))),
                urlBase, Duration.ofMillis(msEsperaOficial));
        hilosDeSugerenciasValidos(hilosDeSugerencias);
        log.info("Clasificador HTTP: {} (timeout {} + {} ms, {} llamadas a la vez; la sugerencia oficial espera"
                + " turno hasta {} ms)", url, MS_CONEXION, MS_LECTURA, LLAMADAS_SIMULTANEAS, msEsperaOficial);
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
        this(builder, urlBase, Duration.ofMillis(MS_ESPERA_OFICIAL_POR_DEFECTO));
    }

    /** Con otra espera de la sugerencia oficial: los tests la acortan. */
    InferenciaHttpAdapter(RestClient.Builder builder, String urlBase, Duration esperaOficial) {
        this.url = urlDetecciones(urlBase);
        this.esperaOficial = esperaOficialValida(esperaOficial);
        this.restClient = builder.build();
    }

    /** Entre 0 (no espera, como la vista previa) y {@value #MS_ESPERA_OFICIAL_MAXIMA} ms; si no, no arranca. */
    static Duration esperaOficialValida(Duration espera) {
        if (espera == null || espera.isNegative() || espera.toMillis() > MS_ESPERA_OFICIAL_MAXIMA) {
            throw new IllegalStateException("CLASIFICACION_ESPERA_TURNO_MS (" + PROPIEDAD_ESPERA_OFICIAL
                    + ") debe estar entre 0 y " + MS_ESPERA_OFICIAL_MAXIMA + " ms, no "
                    + (espera == null ? "vacia" : espera.toMillis() + " ms"));
        }
        return espera;
    }

    /**
     * Entre 1 y {@value #LLAMADAS_SIMULTANEAS} - 1; si no, no arranca. Cada hilo
     * del executor de las sugerencias puede tener un turno: con
     * {@value #LLAMADAS_SIMULTANEAS} o mas, las sugerencias oficiales podrian
     * ocuparlos todos y dejar sin sugerencia a las vistas previas, que no
     * esperan (NC-04c). Lo valida este modulo y no {@code AsyncConfig}:
     * {@code common} no depende de {@code clasificacion}.
     */
    static void hilosDeSugerenciasValidos(int hilos) {
        if (hilos < 1 || hilos >= LLAMADAS_SIMULTANEAS) {
            throw new IllegalStateException("ASYNC_SUGERENCIAS_HILOS (" + PROPIEDAD_HILOS_SUGERENCIAS
                    + ") debe estar entre 1 y " + (LLAMADAS_SIMULTANEAS - 1) + " (menos que las "
                    + LLAMADAS_SIMULTANEAS + " llamadas simultaneas a la inferencia, para que la vista previa"
                    + " conserve turnos), no " + hilos);
        }
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
    public ResultadoDeteccion detectar(ArchivoSubido foto, OrigenDeConsulta origen) {
        if (foto == null || foto.vacio()) {
            throw new ClasificacionNoDisponibleException("Foto vacia: no hay nada que clasificar");
        }
        tomarTurno(origen);
        try {
            return llamar(foto);
        } finally {
            turnos.release();
        }
    }

    /**
     * Toma un turno o lanza «sin sugerencia». La vista previa no espera; la
     * sugerencia oficial espera hasta {@link #esperaOficial} (ver la cabecera
     * de la clase). Si el hilo se interrumpe mientras espera, se rinde y
     * conserva la interrupcion. Al apagar, la parada coordinada del executor
     * de las sugerencias deja terminar la espera; solo si alguna sigue
     * corriendo cuando se destruye el executor, este la interrumpe
     * ({@code AsyncConfig#ejecutorSugerencias}).
     */
    private void tomarTurno(OrigenDeConsulta origen) {
        if (origen != OrigenDeConsulta.SUGERENCIA_OFICIAL) {
            if (!turnos.tryAcquire()) {
                log.warn("Inferencia: sin turno para la vista previa, {} llamadas en curso (sin sugerencia)",
                        LLAMADAS_SIMULTANEAS);
                throw sinTurno();
            }
            return;
        }
        long inicio = System.nanoTime();
        boolean conTurno;
        try {
            conTurno = turnos.tryAcquire(esperaOficial.toNanos(), TimeUnit.NANOSECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Inferencia: la sugerencia oficial se interrumpio esperando turno tras {} ms (sin sugerencia)",
                    msDesde(inicio));
            throw new ClasificacionNoDisponibleException("Interrumpida mientras esperaba turno para la inferencia");
        }
        long ms = msDesde(inicio);
        if (!conTurno) {
            log.warn("Inferencia: la sugerencia oficial espero {} ms sin turno, {} llamadas en curso (sin sugerencia)",
                    ms, LLAMADAS_SIMULTANEAS);
            throw sinTurno();
        }
        if (ms > 0) {
            log.info("Inferencia: la sugerencia oficial espero {} ms por un turno", ms);
        }
    }

    private static ClasificacionNoDisponibleException sinTurno() {
        return new ClasificacionNoDisponibleException(
                "Sin turno para la inferencia: " + LLAMADAS_SIMULTANEAS + " llamadas en curso");
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
        } catch (CancellationException e) {
            // Spring 6.2 corta la lectura cancelando el futuro del HttpClient del
            // JDK; segun el momento en que lo corta, llega asi y no como
            // ResourceAccessException. Es el mismo timeout.
            long ms = msDesde(inicio);
            log.warn("Inferencia: sin respuesta en {} ms (Timeout de lectura: el pedido se cancelo)", ms);
            throw new ClasificacionNoDisponibleException(
                    "La inferencia no respondio a tiempo (Timeout de lectura, pedido cancelado)");
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
