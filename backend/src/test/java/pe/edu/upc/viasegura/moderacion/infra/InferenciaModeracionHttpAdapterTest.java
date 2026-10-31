package pe.edu.upc.viasegura.moderacion.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.ExpectedCount.manyTimes;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion.CREACION;
import static pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion.VISTA_PREVIA;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.Timeout.ThreadMode;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseCreator;
import org.springframework.web.client.RestClient;
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PuntajeDeModeracion;
import pe.edu.upc.viasegura.moderacion.port.ModeracionNoDisponibleException;

/**
 * Adaptador HTTP de la moderacion (NC-10b) contra el contrato
 * {@code POST /v1/moderacion} ({@code handoffs/2026-10-28-contrato-moderacion-v1.md}),
 * sin el servicio: {@link MockRestServiceServer} atado al
 * {@link RestClient.Builder} del adaptador. Los ultimos casos abren un socket
 * local para lo que el mock no ve: HTTP/1.1, los timeouts reales y una conexion
 * rechazada.
 *
 * <p>Cualquier cosa distinta de un 200 que cumpla el contrato es
 * {@link ModeracionNoDisponibleException} (en la creacion, 503
 * {@code MODERACION_NO_DISPONIBLE}), sin reintentos; el log separa la causa:
 * {@code ERROR} para un 4xx o un 200 fuera del contrato, {@code WARN} para 5xx,
 * 503 o sin respuesta.</p>
 */
@ExtendWith(OutputCaptureExtension.class)
class InferenciaModeracionHttpAdapterTest {

    private static final String BASE = "http://inferencia.test:8000";
    private static final String URL = BASE + "/v1/moderacion";
    private static final String VERSION = "nsfw-vit-tiny-384-0c26ec2-1ba7cf26";
    /** El nombre del archivo del ciudadano: no debe viajar al servicio. */
    private static final String NOMBRE_ORIGINAL = "IMG_20261029_casa_de_ana.jpg";
    private static final FotoSaneada FOTO = new FotoSaneada(
            "jpeg-saneado-de-prueba".getBytes(StandardCharsets.US_ASCII), NOMBRE_ORIGINAL);
    private static final String RESPUESTA = "{\"version_modelo\": \"" + VERSION + "\", \"puntaje\": 0.059}";

    private MockRestServiceServer servidor;
    private InferenciaModeracionHttpAdapter adaptador;

    @BeforeEach
    void crear() {
        conEsperaDeCreacion(Duration.ofMillis(InferenciaModeracionHttpAdapter.MS_ESPERA_CREACION));
    }

    /** Un adaptador con otra espera de la creacion, atado a un servidor simulado nuevo. */
    private void conEsperaDeCreacion(Duration espera) {
        RestClient.Builder builder = RestClient.builder();
        servidor = MockRestServiceServer.bindTo(builder).build();
        adaptador = new InferenciaModeracionHttpAdapter(builder, BASE, espera);
    }

    private void responde(String json) {
        servidor.expect(once(), requestTo(URL)).andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
    }

    private ModeracionNoDisponibleException falla() {
        ModeracionNoDisponibleException error = catchThrowableOfType(ModeracionNoDisponibleException.class,
                () -> adaptador.medir(FOTO, CREACION));
        assertThat(error).as("se esperaba «no disponible»").isNotNull();
        return error;
    }

    private static void enElLog(CapturedOutput salida, String nivel, String fragmento) {
        assertThat(salida.getOut().lines().filter(l -> l.contains(fragmento)))
                .as("linea del log con «%s»", fragmento)
                .isNotEmpty()
                .allSatisfy(l -> assertThat(l).contains(nivel));
    }

    // --- 200 ---------------------------------------------------------------

    @Test
    void doscientos_devuelveVersionYPuntaje_yEnviaLaFotoSinElNombreOriginal(CapturedOutput salida) {
        servidor.expect(once(), requestTo(URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header(HttpHeaders.CONTENT_TYPE, startsWith(MediaType.MULTIPART_FORM_DATA_VALUE)))
                .andExpect(header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE))
                .andExpect(content().string(allOf(
                        containsString("name=\"imagen\""),
                        containsString("filename=\"foto.jpg\""),
                        containsString("Content-Type: image/jpeg"),
                        containsString("jpeg-saneado-de-prueba"),
                        not(containsString(NOMBRE_ORIGINAL)))))
                .andRespond(withSuccess(RESPUESTA, MediaType.APPLICATION_JSON));

        PuntajeDeModeracion puntaje = adaptador.medir(FOTO, VISTA_PREVIA);

        servidor.verify();
        assertThat(puntaje).isEqualTo(new PuntajeDeModeracion(VERSION, 0.059));
        // La duracion y la version, sin el puntaje de una foto aceptada.
        assertThat(salida.getOut()).containsPattern("Moderacion: 200 en \\d+ ms, modelo " + VERSION)
                .doesNotContain("0.059");
    }

    @Test
    void losBordesDelPuntaje_0y1_yLosCamposDesconocidos_valen() {
        responde("{\"version_modelo\": \"" + VERSION + "\", \"puntaje\": 0, \"otro\": [1, 2]}");
        responde("{\"puntaje\": 1.0, \"version_modelo\": \"" + "v".repeat(40) + "\"}");

        assertThat(adaptador.medir(FOTO, CREACION).puntaje()).isZero();
        assertThat(adaptador.medir(FOTO, CREACION).puntaje()).isEqualTo(1.0);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"puntaje\": 0.5}",
            "{\"version_modelo\": \"v1\"}",
            "{\"version_modelo\": \"v1\", \"puntaje\": 1.5}",
            "{\"version_modelo\": \"v1\", \"puntaje\": -0.01}",
            "{\"version_modelo\": \"v1\", \"puntaje\": \"0.5\"}",
            "{\"version_modelo\": \"v1\", \"puntaje\": null}",
            "{\"version_modelo\": \"v1\", \"puntaje\": 1e400}",
            "{\"version_modelo\": 7, \"puntaje\": 0.5}",
            "{\"version_modelo\": \"  \", \"puntaje\": 0.5}",
            "{\"version_modelo\": \"12345678901234567890123456789012345678901\", \"puntaje\": 0.5}",
            "[0.5]",
            "no es json",
            "{\"version_modelo\": \"v1\", \"puntaje\": 0.5} {}"})
    void unDoscientosFueraDelContrato_noEsUnPuntaje_yQuedaComoError(String cuerpo, CapturedOutput salida) {
        responde(cuerpo);

        assertThat(falla().getMessage()).contains("fuera del contrato");
        enElLog(salida, "ERROR", "fuera del contrato /v1");
    }

    @Test
    void unCuerpoDe200QuePasaDelTope_esFueraDelContrato() {
        String relleno = " ".repeat(InferenciaModeracionHttpAdapter.MAX_BYTES_RESPUESTA);
        responde("{\"version_modelo\": \"v1\", \"puntaje\": 0.5}" + relleno);

        assertThat(falla().getMessage()).contains("pasa de");
    }

    // --- Errores del servicio ----------------------------------------------------

    @ParameterizedTest
    @CsvSource({"400, imagen_invalida", "400, solicitud_invalida", "413, imagen_demasiado_grande"})
    void error4xx_esNoDisponible_yQuedaComoErrorEnElLog(int status, String codigo, CapturedOutput salida) {
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.valueOf(status))
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"codigo\": \"" + codigo + "\", \"mensaje\": \"x\"}"));

        assertThat(falla().getMessage()).contains("HTTP " + status + ", " + codigo);
        enElLog(salida, "ERROR", "pedido rechazado, HTTP " + status + ", " + codigo);
    }

    @Test
    void error500_esNoDisponible_yQuedaComoWarn(CapturedOutput salida) {
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR)
                .contentType(MediaType.APPLICATION_JSON).body("{\"codigo\": \"error_de_inferencia\"}"));

        assertThat(falla().getMessage()).contains("HTTP 500, error_de_inferencia");
        enElLog(salida, "WARN", "error del servicio, HTTP 500");
    }

    @Test
    void error503EnTextoPlano_esServicioSaturado(CapturedOutput salida) {
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE)
                .contentType(MediaType.TEXT_PLAIN).body("Service Unavailable"));

        assertThat(falla().getMessage()).contains("saturada");
        enElLog(salida, "WARN", "servicio saturado, HTTP 503");
    }

    @ParameterizedTest
    @ValueSource(ints = {201, 204, 302})
    void otraRespuestaQueNoEs200_esNoDisponible(int status) {
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.valueOf(status)).body(RESPUESTA));

        assertThat(falla().getMessage()).contains("HTTP " + status, "no 200");
    }

    @Test
    void timeout_esNoDisponible(CapturedOutput salida) {
        servidor.expect(once(), requestTo(URL)).andRespond(withException(new HttpTimeoutException("timed out")));

        assertThat(falla().getMessage()).contains("no respondio a tiempo", "HttpTimeoutException");
        enElLog(salida, "WARN", "Moderacion: sin respuesta en");
    }

    @Test
    void unaLecturaCancelada_esNoDisponible_yLiberaElTurno() {
        servidor.expect(manyTimes(), requestTo(URL)).andRespond(pedido -> {
            throw new CancellationException();
        });

        for (int i = 0; i <= InferenciaModeracionHttpAdapter.LLAMADAS_SIMULTANEAS; i++) {
            assertThat(falla().getMessage()).contains("no respondio a tiempo");
        }
    }

    @Test
    void sinReintentos_unFalloEsUnaSolaLlamada() {
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        falla();

        servidor.verify();
    }

    @Test
    void losTurnosSeDevuelvenTambienCuandoLaLlamadaFalla() {
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.BAD_REQUEST));
        servidor.expect(once(), requestTo(URL)).andRespond(withException(new HttpTimeoutException("timeout")));
        servidor.expect(once(), requestTo(URL)).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        servidor.expect(once(), requestTo(URL)).andRespond(withSuccess(RESPUESTA, MediaType.APPLICATION_JSON));

        for (int i = 0; i < 5; i++) {
            falla();
        }

        assertThat(adaptador.medir(FOTO, VISTA_PREVIA).versionModelo()).isEqualTo(VERSION);
        servidor.verify();
    }

    // --- Entrada y configuracion ---------------------------------------------

    @Test
    void sinFoto_noLlamaAlServicio() {
        assertThatThrownBy(() -> adaptador.medir(null, CREACION)).isInstanceOf(ModeracionNoDisponibleException.class);
        servidor.verify();
    }

    @Test
    void siempreEstaActivo_unServicioCaidoSeNotaAlLlamarlo() {
        assertThat(adaptador.estaActivo()).isTrue();
    }

    @Test
    void laUrlEsLaBaseMasLaRuta_conOSinBarraFinal() {
        assertThat(InferenciaModeracionHttpAdapter.urlModeracion("http://inferencia.railway.internal:8000"))
                .hasToString("http://inferencia.railway.internal:8000/v1/moderacion");
        assertThat(InferenciaModeracionHttpAdapter.urlModeracion(" http://localhost:8010// "))
                .hasToString("http://localhost:8010/v1/moderacion");
    }

    @Test
    void sinUrl_noArrancaYNombraLaVariable() {
        assertThatThrownBy(() -> new InferenciaModeracionHttpAdapter(" "))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MODERACION_URL");
    }

    @Test
    void conLaConfiguracionDeProduccion_cuatroTurnosYLaCreacionEspera1s() {
        // 4 de moderacion + 4 de deteccion = 8, por debajo del tope de 10
        // conexiones del servicio (handoff, «Tope de conexiones»).
        assertThat(InferenciaModeracionHttpAdapter.LLAMADAS_SIMULTANEAS).isEqualTo(4);
        assertThat(InferenciaModeracionHttpAdapter.MS_ESPERA_CREACION).isEqualTo(1_000);
        assertThat(InferenciaModeracionHttpAdapter.MS_CONEXION + InferenciaModeracionHttpAdapter.MS_LECTURA)
                .isLessThanOrEqualTo(3_000);
    }

    // --- Turno (bulkhead) ----------------------------------------------------

    /** Retiene en el servidor cada llamada que llega hasta {@code soltar}, y cuenta cuantas hay a la vez. */
    private static ResponseCreator retener(CountDownLatch llegadas, CountDownLatch soltar, AtomicInteger enElServidor,
                                           AtomicInteger maximo, AtomicInteger llegaron) {
        return pedido -> {
            maximo.accumulateAndGet(enElServidor.incrementAndGet(), Math::max);
            llegaron.incrementAndGet();
            llegadas.countDown();
            try {
                soltar.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            enElServidor.decrementAndGet();
            return withSuccess(RESPUESTA, MediaType.APPLICATION_JSON).createResponse(pedido);
        };
    }

    @Test
    void conSeisVistasPreviasSimultaneas_aLoSumoCuatroLleganAlServidor_yLasOtrasNoEsperan() throws Exception {
        CountDownLatch cuatroEnElServidor = new CountDownLatch(InferenciaModeracionHttpAdapter.LLAMADAS_SIMULTANEAS);
        CountDownLatch soltar = new CountDownLatch(1);
        AtomicInteger enElServidor = new AtomicInteger();
        AtomicInteger maximo = new AtomicInteger();
        AtomicInteger llegaron = new AtomicInteger();
        servidor.expect(manyTimes(), requestTo(URL))
                .andRespond(retener(cuatroEnElServidor, soltar, enElServidor, maximo, llegaron));

        CountDownLatch salida = new CountDownLatch(1);
        CountDownLatch dosSinTurno = new CountDownLatch(2);
        ExecutorService hilos = Executors.newFixedThreadPool(6);
        try {
            List<Future<PuntajeDeModeracion>> llamadas = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                llamadas.add(hilos.submit(() -> {
                    salida.await();
                    try {
                        return adaptador.medir(FOTO, VISTA_PREVIA);
                    } catch (ModeracionNoDisponibleException sinTurno) {
                        dosSinTurno.countDown();
                        return null;
                    }
                }));
            }
            salida.countDown();

            assertThat(cuatroEnElServidor.await(10, TimeUnit.SECONDS)).isTrue();
            // Las dos sin turno se rechazan sin esperar, con las cuatro todavia retenidas.
            assertThat(dosSinTurno.await(10, TimeUnit.SECONDS)).isTrue();
            soltar.countDown();

            List<PuntajeDeModeracion> resultados = new ArrayList<>();
            for (Future<PuntajeDeModeracion> llamada : llamadas) {
                resultados.add(llamada.get(10, TimeUnit.SECONDS));
            }
            assertThat(llegaron).hasValue(4);
            assertThat(maximo.get()).isLessThanOrEqualTo(4);
            assertThat(resultados).filteredOn(r -> r != null).hasSize(4);
        } finally {
            soltar.countDown();
            hilos.shutdownNow();
        }
    }

    /** Ocupa los cuatro turnos con llamadas retenidas en el servidor; devuelve sus futuros. */
    private List<Future<PuntajeDeModeracion>> ocuparLosCuatroTurnos(ExecutorService hilos, CountDownLatch soltar,
                                                                   AtomicInteger llegaron) throws Exception {
        CountDownLatch cuatro = new CountDownLatch(InferenciaModeracionHttpAdapter.LLAMADAS_SIMULTANEAS);
        servidor.expect(manyTimes(), requestTo(URL))
                .andRespond(retener(cuatro, soltar, new AtomicInteger(), new AtomicInteger(), llegaron));
        List<Future<PuntajeDeModeracion>> ocupadas = new ArrayList<>();
        for (int i = 0; i < InferenciaModeracionHttpAdapter.LLAMADAS_SIMULTANEAS; i++) {
            ocupadas.add(hilos.submit(() -> adaptador.medir(FOTO, VISTA_PREVIA)));
        }
        assertThat(cuatro.await(10, TimeUnit.SECONDS)).isTrue();
        return ocupadas;
    }

    @Test
    void conLosCuatroTurnosOcupados_laCreacionEspera_ySigueCuandoSeLiberaUno(CapturedOutput salida) throws Exception {
        conEsperaDeCreacion(Duration.ofSeconds(5));
        CountDownLatch soltar = new CountDownLatch(1);
        AtomicInteger llegaron = new AtomicInteger();
        ExecutorService hilos = Executors.newFixedThreadPool(5);
        try {
            ocuparLosCuatroTurnos(hilos, soltar, llegaron);
            Future<PuntajeDeModeracion> creacion = hilos.submit(() -> adaptador.medir(FOTO, CREACION));

            Thread.sleep(200); // la creacion ya esta esperando turno
            assertThat(creacion).isNotDone();
            assertThat(llegaron).hasValue(4);
            soltar.countDown();

            assertThat(creacion.get(10, TimeUnit.SECONDS).versionModelo()).isEqualTo(VERSION);
            assertThat(llegaron).hasValue(5);
        } finally {
            soltar.countDown();
            hilos.shutdownNow();
        }
        assertThat(salida.getOut()).contains("la creacion espero");
    }

    @Test
    void sinTurnoEnElPlazo_laCreacionSeRinde_sinLlegarAlServidor(CapturedOutput salida) throws Exception {
        conEsperaDeCreacion(Duration.ofMillis(300));
        CountDownLatch soltar = new CountDownLatch(1);
        AtomicInteger llegaron = new AtomicInteger();
        ExecutorService hilos = Executors.newFixedThreadPool(4);
        try {
            ocuparLosCuatroTurnos(hilos, soltar, llegaron);

            long inicio = System.nanoTime();
            ModeracionNoDisponibleException error = catchThrowableOfType(ModeracionNoDisponibleException.class,
                    () -> adaptador.medir(FOTO, CREACION));
            long espera = Duration.ofNanos(System.nanoTime() - inicio).toMillis();

            assertThat(error.getMessage()).startsWith("Sin turno para la moderacion");
            assertThat(espera).isBetween(250L, 5_000L);
            assertThat(llegaron).hasValue(4);
        } finally {
            soltar.countDown();
            hilos.shutdownNow();
        }
        enElLog(salida, "WARN", "sin turno, 4 llamadas en curso");
    }

    @Test
    void laCreacionInterrumpidaMientrasEspera_seRinde_yConservaLaInterrupcion() throws Exception {
        conEsperaDeCreacion(Duration.ofSeconds(30));
        CountDownLatch soltar = new CountDownLatch(1);
        ExecutorService hilos = Executors.newFixedThreadPool(5);
        try {
            ocuparLosCuatroTurnos(hilos, soltar, new AtomicInteger());
            Map<String, Object> visto = new ConcurrentHashMap<>();
            Thread creacion = new Thread(() -> {
                try {
                    adaptador.medir(FOTO, CREACION);
                } catch (ModeracionNoDisponibleException e) {
                    visto.put("mensaje", e.getMessage());
                    visto.put("interrumpido", Thread.currentThread().isInterrupted());
                }
            });
            creacion.start();
            Thread.sleep(200);
            creacion.interrupt();
            creacion.join(5_000);

            assertThat(visto.get("mensaje")).asString().contains("Interrumpida");
            assertThat(visto.get("interrumpido")).isEqualTo(true);
        } finally {
            soltar.countDown();
            hilos.shutdownNow();
        }
    }

    // --- Con sockets locales: lo que el mock no ve ----------------------------

    @Test
    @Timeout(value = 15, unit = TimeUnit.SECONDS, threadMode = ThreadMode.SEPARATE_THREAD)
    void hablaHttp11SinIntentarHttp2_yEnviaElCuerpoEnChunks() throws IOException {
        Map<String, String> visto = new ConcurrentHashMap<>();
        HttpServer local = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        local.createContext("/v1/moderacion", intercambio -> {
            visto.put("protocolo", intercambio.getProtocol());
            visto.put("upgrade", String.valueOf(intercambio.getRequestHeaders().getFirst("Upgrade")));
            visto.put("transferencia", String.valueOf(intercambio.getRequestHeaders().getFirst("Transfer-Encoding")));
            visto.put("cuerpo", new String(intercambio.getRequestBody().readAllBytes(), StandardCharsets.ISO_8859_1));
            byte[] json = RESPUESTA.getBytes(StandardCharsets.UTF_8);
            intercambio.getResponseHeaders().add("Content-Type", "application/json");
            intercambio.sendResponseHeaders(200, json.length);
            try (OutputStream cuerpo = intercambio.getResponseBody()) {
                cuerpo.write(json);
            }
        });
        local.start();
        try {
            InferenciaModeracionHttpAdapter real = new InferenciaModeracionHttpAdapter(
                    "http://127.0.0.1:" + local.getAddress().getPort(), Duration.ofSeconds(1), Duration.ofSeconds(2));

            assertThat(real.medir(FOTO, CREACION).puntaje()).isEqualTo(0.059);
        } finally {
            local.stop(0);
        }
        assertThat(visto.get("protocolo")).isEqualTo("HTTP/1.1");
        assertThat(visto.get("upgrade")).isEqualTo("null");
        assertThat(visto.get("transferencia")).isEqualToIgnoringCase("chunked");
        assertThat(visto.get("cuerpo")).contains("name=\"imagen\"", "filename=\"foto.jpg\"", "jpeg-saneado-de-prueba");
    }

    @Test
    @Timeout(value = 15, unit = TimeUnit.SECONDS, threadMode = ThreadMode.SEPARATE_THREAD)
    void conLosTiemposDeProduccion_unServicioMudoSeCortaPorLaLectura() throws IOException {
        try (ServerSocket mudo = new ServerSocket(0, 10, InetAddress.getLoopbackAddress())) {
            InferenciaModeracionHttpAdapter produccion =
                    new InferenciaModeracionHttpAdapter("http://127.0.0.1:" + mudo.getLocalPort());

            long inicio = System.nanoTime();
            ModeracionNoDisponibleException error = catchThrowableOfType(ModeracionNoDisponibleException.class,
                    () -> produccion.medir(FOTO, CREACION));
            long espera = Duration.ofNanos(System.nanoTime() - inicio).toMillis();

            assertThat(error).isNotNull();
            assertThat(error.getMessage()).contains("Timeout");
            assertThat(espera).isBetween(InferenciaModeracionHttpAdapter.MS_LECTURA - 100,
                    InferenciaModeracionHttpAdapter.MS_LECTURA + 2_000);
        }
    }

    @Test
    @Timeout(value = 15, unit = TimeUnit.SECONDS, threadMode = ThreadMode.SEPARATE_THREAD)
    void conexionRechazada_esNoDisponible() throws IOException {
        int puertoCerrado;
        try (ServerSocket libre = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            puertoCerrado = libre.getLocalPort();
        }
        InferenciaModeracionHttpAdapter sinServicio = new InferenciaModeracionHttpAdapter(
                "http://127.0.0.1:" + puertoCerrado, Duration.ofSeconds(1), Duration.ofSeconds(2));

        assertThatThrownBy(() -> sinServicio.medir(FOTO, OrigenDeModeracion.VISTA_PREVIA))
                .isInstanceOf(ModeracionNoDisponibleException.class)
                .hasMessageContaining("no se pudo conectar");
    }
}
