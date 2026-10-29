package pe.edu.upc.viasegura.moderacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.port.FotoSaneada;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.moderacion.domain.OrigenDeModeracion;
import pe.edu.upc.viasegura.moderacion.domain.PuntajeDeModeracion;
import pe.edu.upc.viasegura.moderacion.port.ModeracionNoDisponibleException;
import pe.edu.upc.viasegura.moderacion.port.ModeradorDeImagen;
import pe.edu.upc.viasegura.reportes.event.ReporteCreadoEvent;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.reportes.service.SugerenciaCategoriaService;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * La moderacion al crear un reporte (NC-10b, D-15): {@code POST /api/reportes}.
 *
 * <p>El puerto {@link ModeradorDeImagen} es un doble de Mockito, encendido:
 * no hay muestras positivas reales en el repo ni se van a juntar (handoff de
 * NC-10a), asi que el rechazo se prueba con el puntaje que devuelve el doble.
 * El almacenamiento es el real (disco local, se cuentan los archivos) y los
 * eventos se graban: una foto rechazada o que no se pudo revisar no se sube,
 * no crea el reporte ni la adhesion y no publica {@link ReporteCreadoEvent}.
 * Sin espiar el almacenamiento a proposito: asi esta clase y
 * {@code VistaPreviaModeracionIT} comparten un solo contexto de Spring (cada
 * contexto distinto retiene su pool de conexiones durante toda la suite).</p>
 *
 * <p>El doble tambien <b>cuenta las llamadas</b>: la sugerencia oficial
 * asincrona (D-08) no llama al moderador, porque la foto guardada ya paso por
 * el al crear el reporte.</p>
 */
@RecordApplicationEvents
class ModeracionCreacionIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;
    private static final String VERSION = "nsfw-vit-tiny-384-0c26ec2-1ba7cf26";

    /** Mismo nombre y tipo que en {@code VistaPreviaModeracionIT}: las dos clases comparten contexto. */
    @MockitoBean
    ModeradorDeImagen moderador;

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
    JdbcTemplate jdbcTemplate;
    @Autowired
    SugerenciaCategoriaService sugerenciaCategoriaService;
    @Autowired
    ApplicationEvents eventos;

    @Value("${app.storage.fotos-dir}")
    String fotosDir;

    @BeforeEach
    void moderacionEncendida() {
        when(moderador.estaActivo()).thenReturn(true);
        when(moderador.medir(any(), any())).thenReturn(new PuntajeDeModeracion(VERSION, 0.05));
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("mod-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private String bearer(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private long bacheId() {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals("Bache")).findFirst().orElseThrow().getId();
    }

    private static MockMultipartFile foto() {
        return new MockMultipartFile("foto", "IMG_0001.JPG", "image/jpeg", ImagenesDePrueba.jpeg(1200, 900));
    }

    private ResultActions crear(Usuario u, MockMultipartFile foto, String titulo, String descripcion, String clave)
            throws Exception {
        MockMultipartHttpServletRequestBuilder pedido = multipart("/api/reportes");
        if (foto != null) {
            pedido.file(foto);
        }
        pedido.param("latitud", String.valueOf(LAT)).param("longitud", String.valueOf(LON))
                .param("categoriaId", String.valueOf(bacheId()))
                .param("titulo", titulo).param("severidad", "ALTA")
                .header("Authorization", bearer(u));
        if (descripcion != null) {
            pedido.param("descripcion", descripcion);
        }
        if (clave != null) {
            pedido.header("Idempotency-Key", clave);
        }
        return mockMvc.perform(pedido);
    }

    private ResultActions crearConFoto(Usuario u) throws Exception {
        return crear(u, foto(), "Hueco frente al parque", "Profundo", null);
    }

    private long fotosEnDisco() throws IOException {
        Path dir = Paths.get(fotosDir, "reportes");
        if (!Files.isDirectory(dir)) {
            return 0;
        }
        try (Stream<Path> archivos = Files.list(dir)) {
            return archivos.count();
        }
    }

    // --- La foto rechazada ------------------------------------------------------

    @Test
    void fotoRechazada_400FotoNoPermitida_sinReporteNiObjetoNiEvento() throws Exception {
        when(moderador.medir(any(), eq(OrigenDeModeracion.CREACION))).thenReturn(new PuntajeDeModeracion(VERSION, 0.93));
        long fotosAntes = fotosEnDisco();

        String cuerpo = crearConFoto(ciudadano())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.codigo", is("FOTO_NO_PERMITIDA")))
                .andExpect(jsonPath("$.message", is("La foto no está permitida. Toma otra.")))
                .andExpect(jsonPath("$.details", contains("foto")))
                .andReturn().getResponse().getContentAsString();

        assertThat(cuerpo).doesNotContain("0.93").doesNotContainIgnoringCase("puntaje").doesNotContain(VERSION);
        assertThat(reporteRepository.count()).isZero();
        assertThat(adhesionRepository.count()).isZero();
        assertThat(fotosEnDisco()).isEqualTo(fotosAntes);
        assertThat(eventos.stream(ReporteCreadoEvent.class)).isEmpty();
    }

    @Test
    void fotoRechazadaEnUnaAdhesion_400_noCreaLaAdhesion() throws Exception {
        Usuario creador = ciudadano();
        long reporteId = objectMapper.readTree(crearConFoto(creador).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asLong();
        when(moderador.medir(any(), eq(OrigenDeModeracion.CREACION))).thenReturn(new PuntajeDeModeracion(VERSION, 0.88));
        long fotosAntes = fotosEnDisco();

        // Otro ciudadano, mismo lugar y categoria: seria una adhesion (US-09).
        crearConFoto(ciudadano())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.codigo", is("FOTO_NO_PERMITIDA")));

        assertThat(adhesionRepository.count()).isEqualTo(1);
        assertThat(reporteRepository.findById(reporteId).orElseThrow().getTotalAdhesiones()).isEqualTo(1);
        assertThat(fotosEnDisco()).isEqualTo(fotosAntes);
    }

    // --- Sin servicio: falla cerrada ---------------------------------------------

    @Test
    void sinServicio_503ModeracionNoDisponible_sinNadaCreado() throws Exception {
        when(moderador.medir(any(), any())).thenThrow(new ModeracionNoDisponibleException("timeout"));
        long fotosAntes = fotosEnDisco();

        crearConFoto(ciudadano())
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.codigo", is("MODERACION_NO_DISPONIBLE")))
                .andExpect(jsonPath("$.message", is(
                        "No pudimos revisar la foto en este momento. Guarda el reporte para enviarlo después"
                                + " o envíalo sin foto.")));

        assertThat(reporteRepository.count()).isZero();
        assertThat(fotosEnDisco()).isEqualTo(fotosAntes);
        assertThat(eventos.stream(ReporteCreadoEvent.class)).isEmpty();
    }

    @Test
    void sinServicio_unReporteSinFotoSeCreaIgual_yElModeradorNoSeLlama() throws Exception {
        when(moderador.medir(any(), any())).thenThrow(new ModeracionNoDisponibleException("caido"));

        crear(ciudadano(), null, "Hueco frente al parque", null, null).andExpect(status().isCreated());

        verify(moderador, never()).medir(any(), any());
        assertThat(reporteRepository.count()).isEqualTo(1);
    }

    @Test
    void elReenvioIdempotente_conElServicioCaido_devuelveLaRespuestaGuardada_sinModerar() throws Exception {
        Usuario ciudadano = ciudadano();
        String clave = UUID.randomUUID().toString();
        String primera = crear(ciudadano, foto(), "Hueco frente al parque", null, clave)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        when(moderador.medir(any(), any())).thenThrow(new ModeracionNoDisponibleException("caido"));

        String reenvio = crear(ciudadano, foto(), "Hueco frente al parque", null, clave)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        assertThat(objectMapper.readTree(reenvio).get("id")).isEqualTo(objectMapper.readTree(primera).get("id"));
        verify(moderador, times(1)).medir(any(), any());
        assertThat(reporteRepository.count()).isEqualTo(1);
    }

    @Test
    void laTransaccionNoEstaAbiertaMientrasSeModera_yLaFotoEsLaSaneada() throws Exception {
        List<String> conTransaccion = new CopyOnWriteArrayList<>();
        List<FotoSaneada> fotosModeradas = new CopyOnWriteArrayList<>();
        List<Long> fotosEnDiscoAlModerar = new CopyOnWriteArrayList<>();
        when(moderador.medir(any(), any())).thenAnswer(invocacion -> {
            if (TransactionSynchronizationManager.isActualTransactionActive()
                    || TransactionSynchronizationManager.isSynchronizationActive()
                    || !TransactionSynchronizationManager.getResourceMap().isEmpty()) {
                conTransaccion.add(String.valueOf(TransactionSynchronizationManager.getResourceMap().keySet()));
            }
            fotosModeradas.add(invocacion.getArgument(0));
            fotosEnDiscoAlModerar.add(fotosEnDisco());
            return new PuntajeDeModeracion(VERSION, 0.05);
        });
        long fotosAntes = fotosEnDisco();
        MockMultipartFile original = new MockMultipartFile("foto", "IMG_0003.JPG", "image/jpeg",
                ImagenesDePrueba.jpegConExif(1200, 900, 6));

        String cuerpo = crear(ciudadano(), original, "Hueco frente al parque", null, null)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        assertThat(conTransaccion).as("transaccion o recursos abiertos al moderar").isEmpty();
        // Moderada una vez, con la creacion como origen, y antes de subirla.
        verify(moderador, times(1)).medir(any(), eq(OrigenDeModeracion.CREACION));
        assertThat(fotosEnDiscoAlModerar).containsExactly(fotosAntes);
        assertThat(fotosEnDisco()).isEqualTo(fotosAntes + 1);
        // Lo que se modero es lo que se guardo: la foto saneada (sin el EXIF del
        // telefono), byte por byte, sin volver a sanearla.
        FotoSaneada moderada = fotosModeradas.get(0);
        assertThat(ImagenesDePrueba.tieneApp1(moderada.contenido())).isFalse();
        String fotoUrl = objectMapper.readTree(cuerpo).get("fotoUrl").asText();
        Path guardada = Paths.get(fotosDir, "reportes", fotoUrl.substring(fotoUrl.lastIndexOf('/') + 1));
        assertThat(Files.readAllBytes(guardada)).isEqualTo(moderada.contenido());
    }

    // --- La sugerencia oficial no modera -------------------------------------------

    @Test
    void laSugerenciaOficial_noLlamaAlModerador() throws Exception {
        long reporteId = objectMapper.readTree(crearConFoto(ciudadano()).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asLong();

        // El executor de test espera a la sugerencia asincrona: ya corrio y escribio.
        assertThat(jdbcTemplate.queryForObject("SELECT version_modelo_sugerencia FROM reporte WHERE id = ?",
                String.class, reporteId)).isEqualTo("falso-0");
        // Una sola llamada: la de la creacion. La sugerencia oficial, cero.
        verify(moderador, times(1)).medir(any(), any());

        // Directo: con el contador en cero, la sugerencia oficial vuelve a
        // clasificar la foto guardada y escribe, sin una sola llamada al moderador.
        clearInvocations(moderador);
        jdbcTemplate.update("UPDATE reporte SET categoria_sugerida_id = NULL, confianza_sugerencia = NULL,"
                + " version_modelo_sugerencia = NULL WHERE id = ?", reporteId);
        sugerenciaCategoriaService.sugerir(reporteId);

        assertThat(jdbcTemplate.queryForObject("SELECT version_modelo_sugerencia FROM reporte WHERE id = ?",
                String.class, reporteId)).isEqualTo("falso-0");
        verify(moderador, never()).medir(any(), any());
    }

    // --- El texto al crear ----------------------------------------------------------

    @Test
    void tituloODescripcionConGroserias_400TextoNoPermitido_sinLaPalabra_yLaFotoNiSeModera() throws Exception {
        Usuario ciudadano = ciudadano();
        long fotosAntes = fotosEnDisco();

        String cuerpoTitulo = crear(ciudadano, foto(), "Pista de mierda en Kennedy", "Profundo", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.codigo", is("TEXTO_NO_PERMITIDO")))
                .andExpect(jsonPath("$.details", contains("titulo")))
                .andExpect(jsonPath("$.message", is(
                        "El título tiene palabras que no están permitidas. Cámbialo para continuar.")))
                .andReturn().getResponse().getContentAsString();
        String cuerpoDescripcion = crear(ciudadano, foto(), "Hueco frente al parque", "Arreglen esto, h u e v o n e s",
                null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.codigo", is("TEXTO_NO_PERMITIDO")))
                .andExpect(jsonPath("$.details", contains("descripcion")))
                .andReturn().getResponse().getContentAsString();

        assertThat(cuerpoTitulo).doesNotContainIgnoringCase("mierda");
        assertThat(cuerpoDescripcion).doesNotContainIgnoringCase("huevon");
        assertThat(reporteRepository.count()).isZero();
        verify(moderador, never()).medir(any(), any());
        assertThat(fotosEnDisco()).isEqualTo(fotosAntes);
    }

    @Test
    void textoYFotoPermitidos_seCreaElReporte() throws Exception {
        crear(ciudadano(), foto(), "Vehículo atrapado en un hueco", "Obstáculo en la pista, ya van tres", null)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fotoUrl").isNotEmpty());

        assertThat(reporteRepository.count()).isEqualTo(1);
        assertThat(eventos.stream(ReporteCreadoEvent.class)).hasSize(1);
    }
}
