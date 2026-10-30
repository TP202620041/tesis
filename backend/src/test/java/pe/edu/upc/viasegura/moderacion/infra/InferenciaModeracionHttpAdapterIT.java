package pe.edu.upc.viasegura.moderacion.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.clasificacion.domain.OrigenDeConsulta;
import pe.edu.upc.viasegura.clasificacion.domain.ResultadoDeteccion;
import pe.edu.upc.viasegura.clasificacion.port.ClasificadorDano;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PuntajeDeModeracion;
import pe.edu.upc.viasegura.moderacion.port.ModeracionNoDisponibleException;
import pe.edu.upc.viasegura.moderacion.port.ModeradorDeImagen;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * La moderacion con {@code app.moderacion.tipo=http} contra el servicio
 * {@code inferencia/} real (NC-10b, contrato {@code /v1/moderacion} de NC-10a):
 * el modelo de Marqo en su contenedor, no un doble.
 *
 * <p><b>Solo corre si existe {@code MODERACION_TEST_URL}</b>; sin ella se
 * omite y la suite sigue igual. La CI no construye la imagen, asi que no esta
 * en {@code CLASES_OBLIGATORIAS}. A mano (sin usar los puertos 8080, 8025,
 * 3307 ni 4566 de otra pila de la maquina):</p>
 * <pre>
 * docker run --rm -d --name inferencia-it -p 8010:8000 --cpus=2 ciudadviva-inferencia:nc10a
 * MODERACION_TEST_URL=http://localhost:8010 mvn verify -Dit.test=InferenciaModeracionHttpAdapterIT
 * docker stop inferencia-it
 * </pre>
 *
 * <p>Comprueba lo que los dobles no pueden: que FastAPI acepta el multipart
 * del adaptador, que la respuesta real cumple la estructura que el adaptador
 * exige, un 4xx real, el determinismo de la vista previa y la creacion, y el
 * tope de conexiones compartido con la deteccion (4 + 4). Solo hay fotos
 * sinteticas: <b>no hay muestras positivas y no se van a juntar</b>, asi que el
 * camino del rechazo lo prueban {@code ModeracionCreacionIT} y
 * {@code VistaPreviaModeracionIT} con un doble del puerto.</p>
 */
@ExtendWith(OutputCaptureExtension.class)
@EnabledIfEnvironmentVariable(named = "MODERACION_TEST_URL", matches = ".+")
class InferenciaModeracionHttpAdapterIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    @Autowired
    ModeradorDeImagen moderador;
    @Autowired
    ClasificadorDano clasificador;
    @Autowired
    SaneadorDeImagen saneador;
    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    CategoriaDanoRepository categoriaRepository;

    @DynamicPropertySource
    static void servicioReal(DynamicPropertyRegistry registry) {
        registry.add("app.moderacion.tipo", () -> "http");
        registry.add("app.moderacion.http.url", () -> System.getenv("MODERACION_TEST_URL"));
        // La deteccion tambien, contra el mismo servicio: el tope de conexiones es compartido.
        registry.add("app.clasificacion.tipo", () -> "http");
        registry.add("app.clasificacion.http.url", () -> System.getenv("MODERACION_TEST_URL"));
    }

    /** Como en la creacion: la foto pasa por el saneado antes de moderarse. */
    private FotoSaneada fotoSaneada(int ancho, int alto) {
        return saneador.sanear(new ArchivoSubido(ImagenesDePrueba.jpegConExif(ancho, alto, 6), "image/jpeg",
                "IMG_0001.JPG"));
    }

    private static void cumpleElContrato(PuntajeDeModeracion puntaje) {
        assertThat(puntaje.versionModelo()).startsWith("nsfw-vit-tiny-384-0c26ec2-").hasSizeLessThanOrEqualTo(40);
        // Una foto sintetica: muy por debajo del umbral (NC-10a midio ~0,05).
        assertThat(puntaje.puntaje()).isBetween(0.0, 0.5);
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("mod-real-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    @Test
    void conTipoHttp_elModeradorEsElAdaptadorDelServicio() {
        assertThat(moderador).isInstanceOf(InferenciaModeracionHttpAdapter.class);
        assertThat(moderador.estaActivo()).isTrue();
    }

    @Test
    void unaFotoSaneada_recibeUnPuntajeQueCumpleElContrato_yLaLlamadaRegistraSuDuracion(CapturedOutput salida) {
        PuntajeDeModeracion puntaje = moderador.medir(fotoSaneada(2400, 1800), OrigenDeModeracion.CREACION);

        cumpleElContrato(puntaje);
        assertThat(salida.getOut()).containsPattern("Moderacion: 200 en \\d+ ms, modelo " + puntaje.versionModelo());
    }

    @Test
    void laMismaFoto_daElMismoPuntaje_enLaVistaPreviaYEnLaCreacion() {
        FotoSaneada foto = fotoSaneada(1280, 960);

        PuntajeDeModeracion previa = moderador.medir(foto, OrigenDeModeracion.VISTA_PREVIA);
        PuntajeDeModeracion creacion = moderador.medir(foto, OrigenDeModeracion.CREACION);

        assertThat(creacion).isEqualTo(previa);
    }

    @Test
    void unArchivoQueNoEsImagen_esUn4xxDelServicio_yNoDisponible(CapturedOutput salida) {
        FotoSaneada noImagen = new FotoSaneada("esto no es una imagen".getBytes(StandardCharsets.UTF_8), "x.jpg");

        assertThatThrownBy(() -> moderador.medir(noImagen, OrigenDeModeracion.CREACION))
                .isInstanceOf(ModeracionNoDisponibleException.class)
                .hasMessageContaining("HTTP 400, imagen_invalida");
        assertThat(salida.getOut()).contains("ERROR").contains("pedido rechazado, HTTP 400, imagen_invalida");
    }

    @Test
    void cuatroModeracionesYCuatroDeteccionesALaVez_ningunaRecibeUn503() throws Exception {
        // El tope de 10 conexiones del servicio es compartido: 4 + 4 caben (handoff de NC-10a).
        FotoSaneada foto = fotoSaneada(1600, 1200);
        CountDownLatch salida = new CountDownLatch(1);
        ExecutorService hilos = Executors.newFixedThreadPool(8);
        List<Future<PuntajeDeModeracion>> moderaciones = new ArrayList<>();
        List<Future<ResultadoDeteccion>> detecciones = new ArrayList<>();
        try {
            for (int i = 0; i < 4; i++) {
                moderaciones.add(hilos.submit(() -> {
                    salida.await();
                    return moderador.medir(foto, OrigenDeModeracion.CREACION);
                }));
                detecciones.add(hilos.submit(() -> {
                    salida.await();
                    return clasificador.detectar(foto.comoArchivo(), OrigenDeConsulta.SUGERENCIA_OFICIAL);
                }));
            }
            salida.countDown();
            for (Future<PuntajeDeModeracion> moderacion : moderaciones) {
                cumpleElContrato(moderacion.get(30, TimeUnit.SECONDS));
            }
            for (Future<ResultadoDeteccion> deteccion : detecciones) {
                assertThat(deteccion.get(30, TimeUnit.SECONDS).versionModelo()).startsWith("rdd2022-rfdetr-nano-");
            }
        } finally {
            hilos.shutdownNow();
        }
    }

    @Test
    void crearUnReporteYLaVistaPrevia_conElServicioReal_aceptanUnaFotoSintetica() throws Exception {
        Usuario ciudadano = ciudadano();
        String bearer = "Bearer " + jwtService.generarToken(ciudadano.getEmail(), "CIUDADANO");
        MockMultipartFile foto = new MockMultipartFile("foto", "IMG_0002.JPG", "image/jpeg",
                ImagenesDePrueba.jpegConExif(1600, 1200, 1));
        long bache = categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals("Bache")).findFirst().orElseThrow().getId();

        mockMvc.perform(multipart("/api/clasificaciones").file(foto).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fotoRechazada", is(false)));
        mockMvc.perform(multipart("/api/reportes").file(foto)
                        .param("latitud", String.valueOf(LAT)).param("longitud", String.valueOf(LON))
                        .param("titulo", "Hueco frente al parque").param("severidad", "ALTA")
                        .param("categoriaId", String.valueOf(bache))
                        .header("Authorization", bearer))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fotoUrl").isNotEmpty());
    }
}
