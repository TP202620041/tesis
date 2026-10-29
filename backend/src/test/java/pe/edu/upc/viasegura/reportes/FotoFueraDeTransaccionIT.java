package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.reportes.service.CrearReporteCommand;
import pe.edu.upc.viasegura.reportes.service.ReporteService;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.FallaAntesDelCommit;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * BE-11: la foto de un reporte se sanea y se sube <b>sin transaccion
 * abierta</b>, y si al final ningun reporte confirmado la usa, se borra.
 *
 * <p>El almacenamiento y el saneado son los reales (disco local), espiados:
 * cada llamada anota si habia una transaccion activa o algun recurso
 * transaccional ligado al hilo (el {@code EntityManager} o la conexion). Que
 * no haya ninguno es lo que asegura que la red de R2 no retiene una conexion
 * del pool. La reversion se fuerza con un listener {@code BEFORE_COMMIT} de
 * prueba que falla ({@link FallaAntesDelCommit}): el reporte ya se inserto y
 * Spring revierte en el commit, como haria un error real de la base. Lo mismo
 * contra un servicio S3 lo prueba {@code S3FotoStorageServiceIT}.</p>
 */
@Import(FallaAntesDelCommit.class)
class FotoFueraDeTransaccionIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    @MockitoSpyBean
    FotoStorageService fotoStorageService;
    @MockitoSpyBean
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
    ReporteRepository reporteRepository;
    @Autowired
    AdhesionReporteRepository adhesionRepository;
    @Autowired
    ReporteService reporteService;
    @Autowired
    TransactionTemplate transactionTemplate;
    @Autowired
    FallaAntesDelCommit fallaAntesDelCommit;

    /** URL de cada foto que subio la creacion, en orden. */
    private final List<String> subidas = new CopyOnWriteArrayList<>();
    /** Por cada saneado, subida o borrado: si habia transaccion o recursos transaccionales en el hilo. */
    private final List<String> conTransaccion = new CopyOnWriteArrayList<>();
    /** Lo que corre "mientras sube la foto" (otro envio que se cruza), una sola vez. */
    private final AtomicReference<Runnable> mientrasSube = new AtomicReference<>();

    @BeforeEach
    void espiar() {
        fallaAntesDelCommit.desactivar();
        doAnswer(invocacion -> {
            anotar("sanear");
            return invocacion.callRealMethod();
        }).when(saneador).sanear(any());
        doAnswer(invocacion -> {
            anotar("subir");
            Runnable otro = mientrasSube.getAndSet(null);
            if (otro != null) {
                otro.run();
            }
            String url = (String) invocacion.callRealMethod();
            subidas.add(url);
            return url;
        }).when(fotoStorageService).almacenarFotoReporteSaneada(any());
        doAnswer(invocacion -> {
            anotar("borrar");
            return invocacion.callRealMethod();
        }).when(fotoStorageService).eliminarFotoReporte(anyString());
    }

    /** Anota el paso si corre con una transaccion activa o con un recurso transaccional ligado al hilo. */
    private void anotar(String paso) {
        if (TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isSynchronizationActive()
                || !TransactionSynchronizationManager.getResourceMap().isEmpty()) {
            conTransaccion.add(paso + " " + TransactionSynchronizationManager.getResourceMap().keySet());
        }
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("be11-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private long categoriaEstandarId() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar)
                .filter(CategoriaDano::isActivo)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("No hay categorias estandar activas sembradas"))
                .getId();
    }

    private static MockMultipartFile foto() {
        return new MockMultipartFile("foto", "bache.jpg", "image/jpeg", ImagenesDePrueba.jpegConExif(120, 80, 6));
    }

    private ResultActions crear(Usuario u, MockMultipartFile foto, String clave) throws Exception {
        MockMultipartHttpServletRequestBuilder peticion = multipart("/api/reportes");
        if (foto != null) {
            peticion.file(foto);
        }
        peticion.param("latitud", String.valueOf(LAT))
                .param("longitud", String.valueOf(LON))
                .param("titulo", "Hueco frente al parque").param("severidad", "ALTA")
                .param("categoriaId", String.valueOf(categoriaEstandarId()))
                .header("Authorization", "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name()));
        if (clave != null) {
            peticion.header("Idempotency-Key", clave);
        }
        return mockMvc.perform(peticion);
    }

    private JsonNode cuerpo(ResultActions resultado) throws Exception {
        return objectMapper.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    private static String nombre(String url) {
        return url.substring(url.lastIndexOf('/') + 1);
    }

    private boolean guardada(String url) {
        return fotoStorageService.cargarFotoReporte(nombre(url)) != null;
    }

    @Test
    void laFotoSeSaneaYSeSubeSinTransaccionNiConexionTomada() throws Exception {
        JsonNode creado = cuerpo(crear(ciudadano(), foto(), null)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false))));

        verify(saneador, times(1)).sanear(any());
        assertThat(subidas).hasSize(1);
        assertThat(conTransaccion).as("saneado y subida sin transaccion ni recursos ligados").isEmpty();
        // La foto subida es la del reporte, y se conserva.
        assertThat(creado.get("fotoUrl").asText()).isEqualTo(subidas.get(0));
        assertThat(reporteRepository.findFotoUrlById(creado.get("id").asLong())).contains(subidas.get(0));
        assertThat(guardada(subidas.get(0))).isTrue();
        verify(fotoStorageService, never()).eliminarFotoReporte(anyString());
    }

    @Test
    void siLaTransaccionSeRevierte_laFotoSubidaSeBorraFueraDeElla() throws Exception {
        fallaAntesDelCommit.activar();

        crear(ciudadano(), foto(), UUID.randomUUID().toString())
                .andExpect(status().isInternalServerError());

        assertThat(subidas).hasSize(1);
        assertThat(guardada(subidas.get(0))).as("el objeto subido no queda en el almacenamiento").isFalse();
        verify(fotoStorageService).eliminarFotoReporte(nombre(subidas.get(0)));
        // El reporte se habia insertado y se revirtio, y el borrado no tomo conexion.
        assertThat(reporteRepository.count()).isZero();
        assertThat(conTransaccion).isEmpty();
    }

    @Test
    void unaAdhesion_noDejaSuFotoEnElAlmacenamiento() throws Exception {
        JsonNode original = cuerpo(crear(ciudadano(), foto(), null).andExpect(status().isCreated()));

        crear(ciudadano(), foto(), null)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(true)))
                .andExpect(jsonPath("$.id", is(original.get("id").asInt())))
                .andExpect(jsonPath("$.fotoUrl", is(original.get("fotoUrl").asText())));

        assertThat(subidas).hasSize(2);
        assertThat(guardada(subidas.get(0))).as("la foto del reporte original").isTrue();
        assertThat(guardada(subidas.get(1))).as("la foto del adherido, que ningun reporte usa").isFalse();
        assertThat(reporteRepository.count()).isEqualTo(1);
        assertThat(conTransaccion).isEmpty();
    }

    @Test
    void unReenvioIdempotente_noSaneaNiSubeLaFotoOtraVez() throws Exception {
        Usuario ciudadano = ciudadano();
        String clave = UUID.randomUUID().toString();
        JsonNode primera = cuerpo(crear(ciudadano, foto(), clave).andExpect(status().isCreated()));

        JsonNode reenvio = cuerpo(crear(ciudadano, foto(), clave).andExpect(status().isCreated()));

        assertThat(reenvio).isEqualTo(primera);
        verify(saneador, times(1)).sanear(any());
        verify(fotoStorageService, times(1)).almacenarFotoReporteSaneada(any());
        assertThat(guardada(subidas.get(0))).isTrue();
        assertThat(reporteRepository.count()).isEqualTo(1);
    }

    @Test
    void unReenvioQueSeConfirmaMientrasSubeLaFoto_devuelveSuRespuestaYBorraLaFoto() throws Exception {
        // La subida ahora pasa antes de la transaccion: en ese lapso, otro envio
        // con la misma clave (el original, que tardo) puede confirmarse. Aqui
        // ese otro envio corre "durante" la subida, directo por el servicio.
        Usuario ciudadano = ciudadano();
        String clave = UUID.randomUUID().toString();
        AtomicReference<Long> idDelOtro = new AtomicReference<>();
        mientrasSube.set(() -> idDelOtro.set(reporteService.crear(ciudadano.getEmail(),
                new CrearReporteCommand(LAT, LON, categoriaEstandarId(), "Hueco frente al parque", null,
                        Severidad.ALTA, false, null),
                clave).id()));

        crear(ciudadano, foto(), clave)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(idDelOtro.get().intValue())))
                .andExpect(jsonPath("$.esAdhesion", is(false)))
                .andExpect(jsonPath("$.fotoUrl").doesNotExist());

        assertThat(subidas).hasSize(1);
        assertThat(guardada(subidas.get(0))).as("la foto de este envio no quedo en ningun reporte").isFalse();
        assertThat(reporteRepository.count()).isEqualTo(1);
        assertThat(conTransaccion).isEmpty();
    }

    @Test
    void unaAdhesionConUnArchivoQueNoEsImagen_409SinAdherirNiSubirNada() throws Exception {
        // La foto se sanea antes de saber si el pedido termina en adhesion
        // (BE-11, y la moderacion de NC-10b la revisa igual): un archivo que
        // no es una imagen se rechaza tambien al adherirse.
        JsonNode original = cuerpo(crear(ciudadano(), null, null).andExpect(status().isCreated()));
        Usuario otro = ciudadano();

        crear(otro, new MockMultipartFile("foto", "bache.jpg", "image/jpeg", "no es una foto".getBytes()), null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", startsWith("Formato de foto no permitido")));

        assertThat(adhesionRepository.existsByReporteIdAndUsuarioId(original.get("id").asLong(), otro.getId()))
                .isFalse();
        verify(fotoStorageService, never()).almacenarFotoReporteSaneada(any());
    }

    @Test
    void crearDentroDeUnaTransaccion_seRechazaSinSanearNiSubirNada() {
        Usuario ciudadano = ciudadano();
        CrearReporteCommand comando = new CrearReporteCommand(LAT, LON, categoriaEstandarId(),
                "Hueco frente al parque", null, Severidad.ALTA, false,
                new ArchivoSubido(ImagenesDePrueba.png(20, 20), "image/png", "a.png"));

        transactionTemplate.executeWithoutResult(estado ->
                assertThatThrownBy(() -> reporteService.crear(ciudadano.getEmail(), comando, null))
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining("BE-11"));

        verify(saneador, never()).sanear(any());
        verify(fotoStorageService, never()).almacenarFotoReporteSaneada(any());
        assertThat(reporteRepository.count()).isZero();
    }
}
