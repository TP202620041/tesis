package pe.edu.upc.viasegura.clasificacion.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.clasificacion.domain.Deteccion;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.clasificacion.port.ClasificacionNoDisponibleException;
import pe.edu.upc.viasegura.clasificacion.port.ClasificadorDano;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * La clasificacion con {@code app.clasificacion.tipo=http} contra el servicio
 * {@code inferencia/} real (NC-04b, contrato {@code /v1}): el modelo
 * RF-DETR Nano en su contenedor, no un doble.
 *
 * <p><b>Solo corre si existe {@code CLASIFICACION_TEST_URL}</b>; sin ella se
 * omite y la suite sigue igual. La CI no construye la imagen (descarga torch
 * y los pesos), asi que no esta en {@code CLASES_OBLIGATORIAS}. A mano:</p>
 * <pre>
 * docker build -t ciudadviva-inferencia inferencia/
 * docker run --rm -d --name inferencia-it -p 8090:8000 --cpus=2 ciudadviva-inferencia
 * CLASIFICACION_TEST_URL=http://localhost:8090 mvn verify -Dit.test=InferenciaHttpAdapterIT
 * docker stop inferencia-it
 * </pre>
 *
 * <p>Comprueba lo que los dobles no pueden: que FastAPI acepta el multipart
 * que arma el adaptador (HTTP/1.1, parte {@code imagen}), que la respuesta
 * real cumple la estructura que el adaptador exige, un 4xx real, el turno
 * frente al tope de conexiones del servicio y el flujo entero (vista previa y
 * sugerencia oficial) con el adaptador elegido por configuracion. Las fotos
 * son sinteticas, asi que no se afirma que el modelo encuentre un bache: esa
 * prueba positiva, con una foto real, es la prueba de humo del despliegue
 * (DEP-13).</p>
 */
@ExtendWith(OutputCaptureExtension.class)
@EnabledIfEnvironmentVariable(named = "CLASIFICACION_TEST_URL", matches = ".+")
class InferenciaHttpAdapterIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    @Autowired
    ClasificadorDano clasificador;
    @Autowired
    SaneadorDeImagen saneador;
    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    JdbcTemplate jdbcTemplate;

    @DynamicPropertySource
    static void servicioReal(DynamicPropertyRegistry registry) {
        registry.add("app.clasificacion.tipo", () -> "http");
        registry.add("app.clasificacion.http.url", () -> System.getenv("CLASIFICACION_TEST_URL"));
    }

    /** Como en la creacion: la foto pasa por el saneado antes de clasificarse. */
    private ArchivoSubido fotoSaneada(int ancho, int alto) {
        return saneador.sanear(new ArchivoSubido(ImagenesDePrueba.jpegConExif(ancho, alto, 6), "image/jpeg",
                "IMG_0001.JPG"));
    }

    private static void cumpleElContrato(ResultadoDeteccion resultado) {
        assertThat(resultado.versionModelo()).startsWith("rdd2022-rfdetr-nano-").hasSizeLessThanOrEqualTo(40);
        assertThat(resultado.detecciones()).hasSizeLessThanOrEqualTo(100).allSatisfy(d -> {
            assertThat(d.clase()).isIn("bache", "grieta");
            assertThat(d.confianza()).isBetween(0.10, 1.0);
        });
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private String bearer(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private long idDe(String nombreCategoria) {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals(nombreCategoria)).findFirst().orElseThrow().getId();
    }

    @Test
    void conTipoHttp_elClasificadorEsElAdaptadorDelServicio() {
        assertThat(clasificador).isInstanceOf(InferenciaHttpAdapter.class);
        assertThat(clasificador.estaDisponible()).isTrue();
    }

    @Test
    void unaFotoSaneada_recibeUnaRespuestaQueCumpleElContrato_yLaLlamadaRegistraSuDuracion(CapturedOutput salida) {
        ResultadoDeteccion resultado = clasificador.detectar(fotoSaneada(2400, 1800));

        cumpleElContrato(resultado);
        assertThat(salida.getOut()).containsPattern("Inferencia: 200 en \\d+ ms, \\d+ deteccion\\(es\\), modelo "
                + resultado.versionModelo());
    }

    @Test
    void laMismaFoto_daLasMismasDetecciones() {
        // D-08: el saneado y el modelo son deterministas; la vista previa y la
        // sugerencia oficial ven la misma imagen y reciben lo mismo.
        ArchivoSubido foto = fotoSaneada(1280, 960);

        ResultadoDeteccion primera = clasificador.detectar(foto);
        ResultadoDeteccion segunda = clasificador.detectar(foto);

        assertThat(segunda).isEqualTo(primera);
    }

    @Test
    void unArchivoQueNoEsImagen_esUn4xxDelServicio_ySinSugerencia(CapturedOutput salida) {
        ArchivoSubido noImagen = new ArchivoSubido("esto no es una imagen".getBytes(StandardCharsets.UTF_8),
                "image/jpeg", "x.jpg");

        assertThatThrownBy(() -> clasificador.detectar(noImagen))
                .isInstanceOf(ClasificacionNoDisponibleException.class)
                .hasMessageContaining("HTTP 400, imagen_invalida");
        assertThat(salida.getOut()).contains("ERROR").contains("pedido rechazado, HTTP 400, imagen_invalida");
    }

    @Test
    void seisLlamadasSimultaneas_lasQueTienenTurnoRecibenRespuesta_ningunaUn503() throws Exception {
        ArchivoSubido foto = fotoSaneada(1600, 1200);
        CountDownLatch salida = new CountDownLatch(1);
        ExecutorService hilos = Executors.newFixedThreadPool(6);
        List<Future<Object>> llamadas = new ArrayList<>();
        try {
            for (int i = 0; i < 6; i++) {
                llamadas.add(hilos.submit(() -> {
                    salida.await();
                    try {
                        return clasificador.detectar(foto);
                    } catch (ClasificacionNoDisponibleException e) {
                        return e.getMessage();
                    }
                }));
            }
            salida.countDown();
            List<Object> resultados = new ArrayList<>();
            for (Future<Object> llamada : llamadas) {
                resultados.add(llamada.get(30, TimeUnit.SECONDS));
            }

            List<Object> respondidas = resultados.stream().filter(ResultadoDeteccion.class::isInstance).toList();
            List<Object> fallidas = resultados.stream().filter(String.class::isInstance).toList();
            // Las que no tuvieron turno fallan al instante; ninguna llega al tope
            // del servicio (503) ni se queda sin respuesta.
            assertThat(respondidas).hasSizeBetween(1, InferenciaHttpAdapter.LLAMADAS_SIMULTANEAS);
            assertThat(fallidas).allSatisfy(m -> assertThat((String) m).startsWith("Sin turno para la inferencia"));
            respondidas.forEach(r -> cumpleElContrato((ResultadoDeteccion) r));
        } finally {
            hilos.shutdownNow();
        }
    }

    @Test
    void vistaPreviaYSugerenciaOficial_conElServicioReal_nuncaFallan(CapturedOutput salida) throws Exception {
        Usuario ciudadano = ciudadano();
        MockMultipartFile foto = new MockMultipartFile("foto", "IMG_0002.JPG", "image/jpeg",
                ImagenesDePrueba.jpegConExif(1600, 1200, 1));

        // Vista previa: 200 con o sin sugerencia (la foto es sintetica).
        mockMvc.perform(multipart("/api/clasificaciones").file(foto).header("Authorization", bearer(ciudadano)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confianza").doesNotExist())
                .andExpect(jsonPath("$.versionModelo").doesNotExist());

        // Creacion: la sugerencia oficial corre despues del commit (el executor
        // de test la espera) y queda completa o vacia, nunca a medias.
        String cuerpo = mockMvc.perform(multipart("/api/reportes").file(foto)
                        .param("latitud", String.valueOf(LAT)).param("longitud", String.valueOf(LON))
                        .param("titulo", "Hueco frente al parque").param("severidad", "ALTA")
                        .param("categoriaId", String.valueOf(idDe("Bache")))
                        .header("Authorization", bearer(ciudadano)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode creado = objectMapper.readTree(cuerpo);
        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT categoria_sugerida_id, confianza_sugerencia,"
                + " version_modelo_sugerencia FROM reporte WHERE id = ?", creado.get("id").asLong());

        if (fila.get("version_modelo_sugerencia") == null) {
            assertThat(fila.get("categoria_sugerida_id")).isNull();
            assertThat(fila.get("confianza_sugerencia")).isNull();
        } else {
            assertThat((String) fila.get("version_modelo_sugerencia")).startsWith("rdd2022-rfdetr-nano-");
            assertThat(fila.get("categoria_sugerida_id")).isNotNull();
        }
        // Las dos llamadas (vista previa y sugerencia oficial) llegaron al servicio.
        assertThat(salida.getOut().lines().filter(l -> l.contains("Inferencia: 200 en")))
                .hasSizeGreaterThanOrEqualTo(2);
    }

    @Test
    void lasDeteccionesSeOrdenanDeMayorAMenorConfianza() {
        // El contrato las devuelve asi; el adaptador conserva el orden.
        List<Deteccion> detecciones = clasificador.detectar(fotoSaneada(2048, 1536)).detecciones();

        for (int i = 1; i < detecciones.size(); i++) {
            assertThat(detecciones.get(i).confianza()).isLessThanOrEqualTo(detecciones.get(i - 1).confianza());
        }
    }
}
