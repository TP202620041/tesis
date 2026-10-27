package pe.edu.upc.viasegura.clasificacion.infra;

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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import pe.edu.upc.viasegura.clasificacion.domain.CategoriaClasificable;
import pe.edu.upc.viasegura.clasificacion.domain.Deteccion;
import pe.edu.upc.viasegura.clasificacion.domain.PoliticaDeSugerencia;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.clasificacion.domain.Sugerencia;
import pe.edu.upc.viasegura.clasificacion.port.ClasificacionNoDisponibleException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;

/**
 * Adaptador HTTP del servicio de inferencia (NC-04b) contra el contrato
 * {@code /v1} ({@code handoffs/2026-10-25-contrato-inferencia-v1.md}), sin
 * el servicio: {@link MockRestServiceServer} atado al
 * {@link RestClient.Builder} del adaptador. Los ultimos casos abren un socket
 * local para probar lo que el mock no ve: HTTP/1.1, los timeouts reales del
 * cliente del JDK (tambien con la configuracion de produccion) y una
 * conexion rechazada.
 *
 * <p>Cada fallo se traduce a {@link ClasificacionNoDisponibleException}
 * («sin sugerencia»), y el log separa la causa: {@code ERROR} para un 4xx o
 * un 200 fuera del contrato, {@code WARN} para 5xx, 503 o sin respuesta.</p>
 */
@ExtendWith(OutputCaptureExtension.class)
class InferenciaHttpAdapterTest {

    private static final String BASE = "http://inferencia.test:8000";
    private static final String URL = BASE + "/v1/detecciones";
    private static final String VERSION = "rdd2022-rfdetr-nano-66429f3-20934b9a";
    /** El nombre del archivo del ciudadano: no debe viajar al servicio. */
    private static final String NOMBRE_ORIGINAL = "IMG_20261026_casa_de_ana.jpg";
    private static final ArchivoSubido FOTO = new ArchivoSubido(
            "jpeg-saneado-de-prueba".getBytes(StandardCharsets.US_ASCII), "image/jpeg", NOMBRE_ORIGINAL);

    /** La respuesta de ejemplo del contrato. */
    private static final String DOS_DETECCIONES = """
            {
              "version_modelo": "%s",
              "detecciones": [
                { "clase": "bache", "confianza": 0.9337, "caja": [3.28, 518.74, 600.0, 599.70] },
                { "clase": "grieta", "confianza": 0.1444, "caja": [290.33, 509.00, 306.88, 534.33] }
              ]
            }
            """.formatted(VERSION);

    private static final CategoriaClasificable BACHE = new CategoriaClasificable(1L, "Bache", "bache");
    private static final CategoriaClasificable PISTA = new CategoriaClasificable(2L, "Pista deteriorada", "grieta");

    private MockRestServiceServer servidor;
    private InferenciaHttpAdapter adaptador;

    @BeforeEach
    void crear() {
        RestClient.Builder builder = RestClient.builder();
        servidor = MockRestServiceServer.bindTo(builder).build();
        adaptador = new InferenciaHttpAdapter(builder, BASE);
    }

    private static String respuesta(String detecciones) {
        return "{\"version_modelo\": \"" + VERSION + "\", \"detecciones\": " + detecciones + "}";
    }

    private void responde(String json) {
        servidor.expect(once(), requestTo(URL)).andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
    }

    private ClasificacionNoDisponibleException falla() {
        ClasificacionNoDisponibleException error = catchThrowableOfType(ClasificacionNoDisponibleException.class,
                () -> adaptador.detectar(FOTO));
        assertThat(error).as("se esperaba «sin sugerencia»").isNotNull();
        return error;
    }

    /** La linea del log que contiene {@code fragmento}, que debe estar en {@code nivel}. */
    private static void enElLog(CapturedOutput salida, String nivel, String fragmento) {
        assertThat(salida.getOut().lines().filter(l -> l.contains(fragmento)))
                .as("linea del log con «%s»", fragmento)
                .isNotEmpty()
                .allSatisfy(l -> assertThat(l).contains(nivel));
    }

    // --- 200 ---------------------------------------------------------------

    @Test
    void doscientosConDetecciones_devuelveVersionYDetecciones_yEnviaLaFotoSinElNombreOriginal() {
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
                .andRespond(withSuccess(DOS_DETECCIONES, MediaType.APPLICATION_JSON));

        ResultadoDeteccion resultado = adaptador.detectar(FOTO);

        servidor.verify();
        assertThat(resultado.versionModelo()).isEqualTo(VERSION);
        // Sin la caja: la politica no la usa.
        assertThat(resultado.detecciones())
                .containsExactly(new Deteccion("bache", 0.9337), new Deteccion("grieta", 0.1444));
    }

    @Test
    void doscientosSinDetecciones_esUnResultadoVacio() {
        responde(respuesta("[]"));

        ResultadoDeteccion resultado = adaptador.detectar(FOTO);

        assertThat(resultado.versionModelo()).isEqualTo(VERSION);
        assertThat(resultado.detecciones()).isEmpty();
    }

    @Test
    void doscientosConUnaClaseDesconocida_noInvalidaLaRespuesta_laDescartaLaPolitica() {
        responde(respuesta("""
                [{"clase": "alcantarilla", "confianza": 0.95, "caja": [0, 0, 1, 1]},
                 {"clase": "bache", "confianza": 0.80, "caja": [0, 0, 1, 1]}]"""));

        ResultadoDeteccion resultado = adaptador.detectar(FOTO);

        assertThat(resultado.detecciones()).containsExactly(
                new Deteccion("alcantarilla", 0.95), new Deteccion("bache", 0.80));
        Sugerencia sugerencia = new PoliticaDeSugerencia(0.50).aplicar(resultado, List.of(BACHE, PISTA)).orElseThrow();
        assertThat(sugerencia.nombreCategoria()).isEqualTo("Bache");
        assertThat(sugerencia.confianza()).isEqualByComparingTo("0.800");
    }

    @Test
    void doscientosConConfianzaDe1_5_noInvalidaLaRespuesta_laDescartaLaPolitica() {
        responde(respuesta("""
                [{"clase": "bache", "confianza": 1.5, "caja": [0, 0, 1, 1]},
                 {"clase": "grieta", "confianza": 0.70, "caja": [0, 0, 1, 1]}]"""));

        ResultadoDeteccion resultado = adaptador.detectar(FOTO);

        assertThat(resultado.detecciones()).containsExactly(new Deteccion("bache", 1.5), new Deteccion("grieta", 0.70));
        Sugerencia sugerencia = new PoliticaDeSugerencia(0.50).aplicar(resultado, List.of(BACHE, PISTA)).orElseThrow();
        assertThat(sugerencia.nombreCategoria()).isEqualTo("Pista deteriorada");
    }

    @Test
    void camposDesconocidosYLaCaja_seIgnoranAunqueNoTenganLaFormaEsperada() {
        responde("""
                {"version_modelo": "%s", "tiempo_ms": 412, "modelo": {"hilos": 2},
                 "detecciones": [{"clase": "bache", "confianza": 0.9, "caja": "no es una lista", "extra": null},
                                 {"clase": "grieta", "confianza": 1}]}
                """.formatted(VERSION));

        assertThat(adaptador.detectar(FOTO).detecciones())
                .containsExactly(new Deteccion("bache", 0.9), new Deteccion("grieta", 1.0));
    }

    @Test
    void versionDe40Caracteres_esValida() {
        String cuarenta = "v".repeat(40);
        responde("{\"version_modelo\": \"" + cuarenta + "\", \"detecciones\": []}");

        assertThat(adaptador.detectar(FOTO).versionModelo()).isEqualTo(cuarenta);
    }

    @Test
    void cadaLlamada_registraSuDuracion(CapturedOutput salida) {
        responde(DOS_DETECCIONES);

        adaptador.detectar(FOTO);

        assertThat(salida.getOut()).containsPattern(
                "INFO.*Inferencia: 200 en \\d+ ms, 2 deteccion\\(es\\), modelo " + VERSION);
    }

    // --- 200 fuera del contrato ------------------------------------------------

    @Test
    void sinVersionModelo_rechazaLaRespuestaEntera(CapturedOutput salida) {
        responde("{\"detecciones\": [{\"clase\": \"bache\", \"confianza\": 0.9, \"caja\": [0, 0, 1, 1]}]}");

        assertThat(falla().getMessage()).contains("fuera del contrato", "version_modelo");
        enElLog(salida, "ERROR", "fuera del contrato");
    }

    @Test
    void versionModeloDe41Caracteres_rechazaLaRespuestaEntera() {
        // Iria a reporte.version_modelo_sugerencia VARCHAR(40).
        responde("{\"version_modelo\": \"" + "v".repeat(41) + "\", \"detecciones\": []}");

        assertThat(falla().getMessage()).contains("fuera del contrato", "40", "(41)");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"version_modelo\": \"\", \"detecciones\": []}",
            "{\"version_modelo\": 7, \"detecciones\": []}",
            "{\"version_modelo\": null, \"detecciones\": []}",
            "{\"version_modelo\": \"rdd2022\"}",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": null}",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": {\"clase\": \"bache\"}}",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": [0.9]}",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": [{\"confianza\": 0.9}]}",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": [{\"clase\": 1, \"confianza\": 0.9}]}",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": [{\"clase\": \"bache\"}]}",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": [{\"clase\": \"bache\", \"confianza\": \"0.9\"}]}",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": [{\"clase\": \"bache\", \"confianza\": null}]}",
            "[{\"version_modelo\": \"rdd2022\", \"detecciones\": []}]",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": []} basura",
            "{\"version_modelo\": \"rdd2022\", \"detecciones\": [",
            "no es json",
            ""})
    void tiposQueNoSonLosDelContrato_rechazanLaRespuestaEntera(String cuerpo) {
        responde(cuerpo);

        assertThat(falla().getMessage()).contains("fuera del contrato");
    }

    // --- Distinto de 200 -------------------------------------------------------

    @ParameterizedTest
    @CsvSource({
            "400, imagen_invalida",
            "400, solicitud_invalida",
            "413, imagen_demasiado_grande"})
    void error4xx_esSinSugerencia_yQuedaComoErrorEnElLog(int status, String codigo, CapturedOutput salida) {
        servidor.expect(once(), requestTo(URL))
                .andRespond(withStatus(HttpStatus.valueOf(status))
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"codigo\": \"" + codigo + "\", \"mensaje\": \"La imagen no es valida.\"}"));

        assertThat(falla().getMessage()).contains("rechazo la foto", "HTTP " + status + ", " + codigo);
        enElLog(salida, "ERROR", "pedido rechazado, HTTP " + status + ", " + codigo);
        assertThat(salida.getOut()).doesNotContain("La imagen no es valida.");
    }

    @Test
    void error500_esSinSugerencia_yQuedaComoWarnDelServicio(CapturedOutput salida) {
        servidor.expect(once(), requestTo(URL))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"codigo\": \"error_de_inferencia\", \"mensaje\": \"onnxruntime fallo\"}"));

        assertThat(falla().getMessage()).contains("fallo", "HTTP 500, error_de_inferencia");
        enElLog(salida, "WARN", "error del servicio, HTTP 500, error_de_inferencia");
    }

    @Test
    void error503_esSinSugerencia_yQuedaComoServicioSaturado(CapturedOutput salida) {
        // El 503 lo responde uvicorn en texto plano, sin el cuerpo del contrato.
        servidor.expect(once(), requestTo(URL))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE)
                        .contentType(MediaType.TEXT_PLAIN)
                        .body("Service Unavailable"));

        assertThat(falla().getMessage()).contains("saturada", "HTTP 503");
        enElLog(salida, "WARN", "servicio saturado, HTTP 503");
    }

    @ParameterizedTest
    @ValueSource(ints = {201, 204, 302})
    void otraRespuestaQueNoEs200_esSinSugerencia(int status) {
        servidor.expect(once(), requestTo(URL))
                .andRespond(withStatus(HttpStatus.valueOf(status)).body(DOS_DETECCIONES));

        assertThat(falla().getMessage()).contains("HTTP " + status, "no 200");
    }

    @Test
    void timeout_esSinSugerencia(CapturedOutput salida) {
        servidor.expect(once(), requestTo(URL))
                .andRespond(withException(new HttpTimeoutException("request timed out")));

        assertThat(falla().getMessage()).contains("no respondio a tiempo", "HttpTimeoutException");
        enElLog(salida, "WARN", "Inferencia: sin respuesta en");
    }

    @Test
    void sinReintentos_unFalloEsUnaSolaLlamada() {
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        falla();

        // Una segunda llamada haria fallar a MockRestServiceServer al pedirla.
        servidor.verify();
    }

    // --- Entrada y configuracion ---------------------------------------------

    @Test
    void fotoVacia_noLlamaAlServicio() {
        assertThatThrownBy(() -> adaptador.detectar(new ArchivoSubido(null, "image/jpeg", "f.jpg")))
                .isInstanceOf(ClasificacionNoDisponibleException.class);
        assertThatThrownBy(() -> adaptador.detectar(null)).isInstanceOf(ClasificacionNoDisponibleException.class);
        servidor.verify();
    }

    @Test
    void siempreEstaDisponible_unServicioCaidoSeNotaAlLlamarlo() {
        assertThat(adaptador.estaDisponible()).isTrue();
    }

    @Test
    void laUrlEsLaBaseMasLaRuta_conOSinBarraFinal() {
        assertThat(InferenciaHttpAdapter.urlDetecciones("http://inferencia.railway.internal:8000"))
                .hasToString("http://inferencia.railway.internal:8000/v1/detecciones");
        assertThat(InferenciaHttpAdapter.urlDetecciones(" http://localhost:8090// "))
                .hasToString("http://localhost:8090/v1/detecciones");
    }

    @Test
    void sinUrl_noArrancaYNombraLaVariable() {
        assertThatThrownBy(() -> new InferenciaHttpAdapter(RestClient.builder(), " "))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CLASIFICACION_URL");
    }

    // --- Turno (bulkhead) ----------------------------------------------------

    @Test
    void conSeisLlamadasSimultaneas_aLoSumoCuatroLleganAlServidor() throws Exception {
        CountDownLatch cuatroEnElServidor = new CountDownLatch(InferenciaHttpAdapter.LLAMADAS_SIMULTANEAS);
        CountDownLatch soltar = new CountDownLatch(1);
        AtomicInteger enElServidor = new AtomicInteger();
        AtomicInteger maximoEnElServidor = new AtomicInteger();
        AtomicInteger llegaron = new AtomicInteger();
        ResponseCreator retenida = pedido -> {
            maximoEnElServidor.accumulateAndGet(enElServidor.incrementAndGet(), Math::max);
            llegaron.incrementAndGet();
            cuatroEnElServidor.countDown();
            try {
                soltar.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            enElServidor.decrementAndGet();
            return withSuccess(DOS_DETECCIONES, MediaType.APPLICATION_JSON).createResponse(pedido);
        };
        servidor.expect(manyTimes(), requestTo(URL)).andRespond(retenida);

        CountDownLatch salida = new CountDownLatch(1);
        CountDownLatch dosSinTurno = new CountDownLatch(2);
        ExecutorService hilos = Executors.newFixedThreadPool(6);
        try {
            List<Future<ResultadoDeteccion>> llamadas = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                llamadas.add(hilos.submit(() -> {
                    salida.await();
                    try {
                        return adaptador.detectar(FOTO);
                    } catch (ClasificacionNoDisponibleException sinTurno) {
                        dosSinTurno.countDown();
                        return null;
                    }
                }));
            }
            salida.countDown();

            // Cuatro retenidas en el servidor y dos rechazadas al instante, sin esperar turno.
            assertThat(cuatroEnElServidor.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(dosSinTurno.await(10, TimeUnit.SECONDS)).isTrue();
            soltar.countDown();

            List<ResultadoDeteccion> resultados = new ArrayList<>();
            for (Future<ResultadoDeteccion> llamada : llamadas) {
                resultados.add(llamada.get(10, TimeUnit.SECONDS));
            }
            assertThat(llegaron).hasValue(4);
            assertThat(maximoEnElServidor.get()).isLessThanOrEqualTo(4);
            assertThat(resultados).filteredOn(r -> r != null).hasSize(4);
            assertThat(resultados).filteredOn(r -> r == null).hasSize(2);
        } finally {
            soltar.countDown();
            hilos.shutdownNow();
        }

        // Los turnos se devolvieron: una llamada mas llega al servidor.
        assertThat(adaptador.detectar(FOTO).versionModelo()).isEqualTo(VERSION);
        assertThat(llegaron).hasValue(5);
    }

    @Test
    void losTurnosSeDevuelvenTambienCuandoLaLlamadaFalla() {
        // Cinco fallos seguidos con cuatro turnos: si alguno no devolviera el
        // suyo, la ultima llamada se quedaria sin turno y no llegaria.
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        servidor.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.BAD_REQUEST));
        servidor.expect(once(), requestTo(URL)).andRespond(withException(new HttpTimeoutException("timeout")));
        servidor.expect(once(), requestTo(URL)).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        servidor.expect(once(), requestTo(URL)).andRespond(withSuccess(DOS_DETECCIONES, MediaType.APPLICATION_JSON));

        for (int i = 0; i < 5; i++) {
            falla();
        }

        assertThat(adaptador.detectar(FOTO).detecciones()).hasSize(2);
        servidor.verify();
    }

    // --- Con sockets locales: lo que el mock no ve ----------------------------

    @Test
    void hablaHttp11SinIntentarHttp2() throws IOException {
        Map<String, String> visto = new ConcurrentHashMap<>();
        HttpServer local = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        local.createContext("/v1/detecciones", intercambio -> {
            visto.put("protocolo", intercambio.getProtocol());
            visto.put("upgrade", String.valueOf(intercambio.getRequestHeaders().getFirst("Upgrade")));
            visto.put("tipo", String.valueOf(intercambio.getRequestHeaders().getFirst("Content-Type")));
            visto.put("cuerpo", new String(intercambio.getRequestBody().readAllBytes(), StandardCharsets.ISO_8859_1));
            byte[] json = DOS_DETECCIONES.getBytes(StandardCharsets.UTF_8);
            intercambio.getResponseHeaders().add("Content-Type", "application/json");
            intercambio.sendResponseHeaders(200, json.length);
            try (OutputStream cuerpo = intercambio.getResponseBody()) {
                cuerpo.write(json);
            }
        });
        local.start();
        try {
            InferenciaHttpAdapter real = new InferenciaHttpAdapter(
                    "http://127.0.0.1:" + local.getAddress().getPort(), Duration.ofSeconds(1), Duration.ofSeconds(2));

            assertThat(real.detectar(FOTO).detecciones()).hasSize(2);
        } finally {
            local.stop(0);
        }
        assertThat(visto.get("protocolo")).isEqualTo("HTTP/1.1");
        assertThat(visto.get("upgrade")).isEqualTo("null");
        assertThat(visto.get("tipo")).startsWith("multipart/form-data;").contains("boundary=");
        assertThat(visto.get("cuerpo")).contains("name=\"imagen\"", "filename=\"foto.jpg\"", "jpeg-saneado-de-prueba");
    }

    @Test
    void laConexionYLaLecturaSuman3sComoMaximo() {
        assertThat(InferenciaHttpAdapter.MS_CONEXION + InferenciaHttpAdapter.MS_LECTURA).isLessThanOrEqualTo(3_000);
    }

    @Test
    void conLosTiemposDeProduccion_unServicioMudoCortaAntesDe3s() throws IOException {
        // Acepta la conexion (la completa el sistema operativo) y nunca responde.
        try (ServerSocket mudo = new ServerSocket(0, 10, InetAddress.getLoopbackAddress())) {
            InferenciaHttpAdapter produccion = new InferenciaHttpAdapter("http://127.0.0.1:" + mudo.getLocalPort());

            long inicio = System.nanoTime();
            ClasificacionNoDisponibleException error = catchThrowableOfType(ClasificacionNoDisponibleException.class,
                    () -> produccion.detectar(FOTO));
            Duration espera = Duration.ofNanos(System.nanoTime() - inicio);

            assertThat(error).isNotNull();
            assertThat(error.getMessage()).contains("Timeout");
            assertThat(espera).isLessThan(Duration.ofSeconds(3));
        }
    }

    @Test
    void unaRespuestaQueSeCortaAMedias_tambienCaeEnElTimeout() throws Exception {
        // Status y cabeceras a tiempo, y el cuerpo nunca termina de llegar.
        CountDownLatch fin = new CountDownLatch(1);
        HttpServer local = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        local.setExecutor(Executors.newCachedThreadPool());
        local.createContext("/v1/detecciones", intercambio -> {
            intercambio.getRequestBody().readAllBytes();
            intercambio.getResponseHeaders().add("Content-Type", "application/json");
            intercambio.sendResponseHeaders(200, 1_000);
            OutputStream cuerpo = intercambio.getResponseBody();
            cuerpo.write("{\"version_modelo\": \"rdd".getBytes(StandardCharsets.UTF_8));
            cuerpo.flush();
            try {
                fin.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        local.start();
        try {
            InferenciaHttpAdapter conTimeouts = new InferenciaHttpAdapter(
                    "http://127.0.0.1:" + local.getAddress().getPort(), Duration.ofSeconds(1), Duration.ofMillis(500));

            long inicio = System.nanoTime();
            ClasificacionNoDisponibleException error = catchThrowableOfType(ClasificacionNoDisponibleException.class,
                    () -> conTimeouts.detectar(FOTO));

            assertThat(error).isNotNull();
            assertThat(error.getMessage()).contains("no respondio a tiempo");
            assertThat(Duration.ofNanos(System.nanoTime() - inicio)).isLessThan(Duration.ofSeconds(3));
        } finally {
            fin.countDown();
            local.stop(0);
        }
    }

    @Test
    void conexionRechazada_esSinSugerencia() throws IOException {
        int puertoCerrado;
        try (ServerSocket libre = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            puertoCerrado = libre.getLocalPort();
        }
        InferenciaHttpAdapter sinServicio = new InferenciaHttpAdapter(
                "http://127.0.0.1:" + puertoCerrado, Duration.ofSeconds(1), Duration.ofSeconds(2));

        assertThatThrownBy(() -> sinServicio.detectar(FOTO))
                .isInstanceOf(ClasificacionNoDisponibleException.class)
                .hasMessageContaining("no se pudo conectar");
    }
}
