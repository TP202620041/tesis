package pe.edu.upc.viasegura.common.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.FallaAntesDelCommit;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Las fotos con {@code app.storage.tipo=s3} contra un servicio S3 real
 * (DEP-12): el emulador Adobe S3Mock en la CI o, a mano antes del primer
 * despliegue, un bucket R2 de prueba (runbook).
 *
 * <p><b>Solo corre si existe {@code FOTOS_S3_TEST_ENDPOINT}</b>; sin ella se
 * omite y la suite local sigue igual. Con S3Mock:</p>
 * <pre>
 * docker run -d --rm -p 9090:9090 --name s3mock adobe/s3mock:5.2.3
 * FOTOS_S3_TEST_ENDPOINT=http://localhost:9090 mvn verify -Dit.test=S3FotoStorageServiceIT
 * </pre>
 * <p>Opcionales: {@code FOTOS_S3_TEST_REGION} ({@code auto}),
 * {@code FOTOS_S3_TEST_ACCESS_KEY_ID} / {@code FOTOS_S3_TEST_SECRET_ACCESS_KEY}
 * ({@code test}, que el emulador no verifica) y
 * {@code FOTOS_S3_TEST_BUCKET_REPORTES} / {@code FOTOS_S3_TEST_BUCKET_PERFILES}.
 * Los buckets se crean si no existen (en R2, crearlos antes: el token de
 * fotos no puede crear buckets). Los objetos que sube cada test se borran al
 * terminar.</p>
 *
 * <p>Recorre la aplicacion entera, no solo el adaptador: la foto sube por
 * {@code POST /api/reportes} y {@code PATCH /api/auth/me} y se descarga por
 * las mismas URL de siempre, con lo que se prueba tambien la eleccion del
 * adaptador y el {@code ResourceResolver} de {@code reportes.infra.FotosDeReporteWebConfig}.</p>
 *
 * <p>BE-11: la foto de un reporte se sube antes de la transaccion de la
 * creacion. Una adhesion, o una creacion que se revierte
 * ({@link FallaAntesDelCommit}), no dejan su objeto en el bucket.</p>
 */
@EnabledIfEnvironmentVariable(named = "FOTOS_S3_TEST_ENDPOINT", matches = ".+")
@Import(FallaAntesDelCommit.class)
class S3FotoStorageServiceIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    private static final String ENDPOINT = System.getenv("FOTOS_S3_TEST_ENDPOINT");
    private static final String REGION = env("FOTOS_S3_TEST_REGION", "auto");
    private static final String ID = env("FOTOS_S3_TEST_ACCESS_KEY_ID", "test");
    private static final String SECRETO = env("FOTOS_S3_TEST_SECRET_ACCESS_KEY", "test");
    private static final String REPORTES = env("FOTOS_S3_TEST_BUCKET_REPORTES", "ciudadviva-it-reportes");
    private static final String PERFILES = env("FOTOS_S3_TEST_BUCKET_PERFILES", "ciudadviva-it-perfiles");

    private static S3Client s3;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    FotoStorageService fotoStorageService;
    @Autowired
    FallaAntesDelCommit fallaAntesDelCommit;

    /** Claves subidas por el test en curso, por bucket, para borrarlas al final. */
    private final List<String[]> subidas = new ArrayList<>();

    @BeforeEach
    void sinFalla() {
        fallaAntesDelCommit.desactivar();
    }

    private static String env(String clave, String porDefecto) {
        String valor = System.getenv(clave);
        return valor == null || valor.isBlank() ? porDefecto : valor;
    }

    @DynamicPropertySource
    static void almacenS3(DynamicPropertyRegistry registry) {
        registry.add("app.storage.tipo", () -> "s3");
        registry.add("app.storage.s3.endpoint", () -> ENDPOINT);
        registry.add("app.storage.s3.region", () -> REGION);
        registry.add("app.storage.s3.access-key-id", () -> ID);
        registry.add("app.storage.s3.secret-access-key", () -> SECRETO);
        registry.add("app.storage.s3.bucket-reportes", () -> REPORTES);
        registry.add("app.storage.s3.bucket-perfiles", () -> PERFILES);
    }

    @BeforeAll
    static void crearBuckets() {
        s3 = S3FotoStorageService.crearCliente(ENDPOINT, REGION, ID, SECRETO);
        for (String bucket : List.of(REPORTES, PERFILES)) {
            try {
                s3.headBucket(b -> b.bucket(bucket));
            } catch (NoSuchBucketException e) {
                s3.createBucket(b -> b.bucket(bucket));
            } catch (S3Exception e) {
                if (e.statusCode() != 404) {
                    throw e;
                }
                s3.createBucket(b -> b.bucket(bucket));
            }
        }
    }

    @AfterAll
    static void cerrar() {
        if (s3 != null) {
            s3.close();
        }
    }

    @AfterEach
    void borrarSubidas() {
        for (String[] subida : subidas) {
            s3.deleteObject(DeleteObjectRequest.builder().bucket(subida[0]).key(subida[1]).build());
        }
    }

    private static String nombre(String url) {
        return url.substring(url.lastIndexOf('/') + 1);
    }

    private static boolean existe(String bucket, String clave) {
        try {
            s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(clave).build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return false;
            }
            throw e;
        }
    }

    /** Las claves que hay hoy en el bucket (el de un test, con pocas fotos). */
    private static Set<String> claves(String bucket) {
        return s3.listObjectsV2Paginator(b -> b.bucket(bucket)).contents().stream()
                .map(objeto -> objeto.key())
                .collect(Collectors.toSet());
    }

    private static byte[] delBucket(String bucket, String clave) {
        return s3.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(clave).build()).asByteArray();
    }

    private String tokenCiudadano() throws Exception {
        String correo = "s3-" + UUID.randomUUID() + "@lima.pe";
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"secreta123","nombre":"Ana","apellido":"Vecina","aceptaTerminos":true,"versionTerminos":"%s"}
                                """.formatted(correo, versionTerminos)))
                .andExpect(status().isCreated());
        return confirmarEIniciarSesion(correo, "secreta123");
    }

    private long categoriaEstandarId() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar)
                .findFirst()
                .orElseThrow()
                .getId();
    }

    private ResultActions crearReporteConFoto(byte[] foto) throws Exception {
        return mockMvc.perform(multipart("/api/reportes")
                .file(new MockMultipartFile("foto", "IMG_0001.JPG", "image/jpeg", foto))
                .param("latitud", String.valueOf(LAT))
                .param("longitud", String.valueOf(LON))
                .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                .param("categoriaId", String.valueOf(categoriaEstandarId()))
                .header("Authorization", "Bearer " + tokenCiudadano()));
    }

    private String subirFotoDeReporte(byte[] foto) throws Exception {
        MvcResult res = crearReporteConFoto(foto)
                .andExpect(status().isCreated())
                .andReturn();
        String url = objectMapper.readTree(res.getResponse().getContentAsString()).get("fotoUrl").asText();
        subidas.add(new String[] {REPORTES, nombre(url)});
        return url;
    }

    private String subirFotoDePerfil(String token, byte[] foto) throws Exception {
        MvcResult res = mockMvc.perform(multipart(HttpMethod.PATCH, "/api/auth/me")
                        .file(new MockMultipartFile("foto", "yo.jpg", "image/jpeg", foto))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        String url = objectMapper.readTree(res.getResponse().getContentAsString()).get("fotoUrl").asText();
        subidas.add(new String[] {PERFILES, nombre(url)});
        return url;
    }

    @Test
    void elAdaptadorActivoEsElDeS3() {
        assertThat(fotoStorageService).isInstanceOf(S3FotoStorageService.class);
    }

    @Test
    void fotoDeReporte_vaSoloAlBucketDeReportesYSeSirvePorLaMismaUrlSinExif() throws Exception {
        String fotoUrl = subirFotoDeReporte(ImagenesDePrueba.jpegConExif(300, 200, 6));
        String clave = nombre(fotoUrl);

        assertThat(fotoUrl).isEqualTo("/media/fotos/reportes/" + clave);
        assertThat(clave).matches("[0-9a-f-]{36}\\.jpg");
        assertThat(existe(REPORTES, clave)).isTrue();
        // Nunca en el bucket de perfiles (dos visibilidades, dos buckets).
        assertThat(existe(PERFILES, clave)).isFalse();

        MvcResult descarga = mockMvc.perform(get(fotoUrl))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "max-age=2592000, public, s-maxage=3600, immutable"))
                .andExpect(header().exists(HttpHeaders.LAST_MODIFIED))
                .andReturn();
        byte[] servida = descarga.getResponse().getContentAsByteArray();
        assertThat(servida).isEqualTo(delBucket(REPORTES, clave));
        assertThat(ImagenesDePrueba.tieneApp1(servida)).isFalse();
        assertThat(ImagenesDePrueba.contiene(servida, ImagenesDePrueba.MARCA_EXIF)).isFalse();
        assertThat(ImagenesDePrueba.leer(servida).getWidth()).isEqualTo(200);

        mockMvc.perform(get(fotoUrl).header(HttpHeaders.IF_MODIFIED_SINCE,
                        descarga.getResponse().getHeader(HttpHeaders.LAST_MODIFIED)))
                .andExpect(status().isNotModified());
    }

    @Test
    void fotoDePerfil_vaSoloAlBucketDePerfilesYSoloLaVeSuDueno() throws Exception {
        String token = tokenCiudadano();
        String fotoUrl = subirFotoDePerfil(token, ImagenesDePrueba.jpegConExif(48, 64, 1));
        String clave = nombre(fotoUrl);

        assertThat(fotoUrl).isEqualTo("/api/perfiles/fotos/" + clave);
        assertThat(existe(PERFILES, clave)).isTrue();
        assertThat(existe(REPORTES, clave)).isFalse();

        MvcResult descarga = mockMvc.perform(get(fotoUrl).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
                .andReturn();
        assertThat(descarga.getResponse().getContentAsByteArray()).isEqualTo(delBucket(PERFILES, clave));

        mockMvc.perform(get(fotoUrl).header("Authorization", "Bearer " + tokenCiudadano()))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(fotoUrl)).andExpect(status().isUnauthorized());
        // Ni por la ruta publica de reportes.
        mockMvc.perform(get("/media/fotos/reportes/" + clave)).andExpect(status().isNotFound());
    }

    @Test
    void alReemplazarLaFotoDePerfil_laAnteriorSeBorraDelBucket() throws Exception {
        String token = tokenCiudadano();
        String primera = nombre(subirFotoDePerfil(token, ImagenesDePrueba.png(30, 30)));
        assertThat(existe(PERFILES, primera)).isTrue();

        String segunda = nombre(subirFotoDePerfil(token, ImagenesDePrueba.png(40, 40)));

        assertThat(existe(PERFILES, primera)).isFalse();
        assertThat(existe(PERFILES, segunda)).isTrue();
    }

    @Test
    void unaFotoInexistente_404YElAdaptadorDevuelveNull() throws Exception {
        String clave = UUID.randomUUID() + ".jpg";

        mockMvc.perform(get("/media/fotos/reportes/" + clave)).andExpect(status().isNotFound());
        assertThat(fotoStorageService.cargarFotoReporte(clave)).isNull();
        assertThat(fotoStorageService.cargarFotoPerfil(clave)).isNull();
        // Borrar algo que no esta no lanza.
        fotoStorageService.eliminarFotoPerfil(clave);
    }

    @Test
    void unArchivoQueNoEsImagen_409YNoSeSubeNada() throws Exception {
        mockMvc.perform(multipart("/api/reportes")
                        .file(new MockMultipartFile("foto", "bache.jpg", "image/jpeg", "no es una foto".getBytes()))
                        .param("latitud", String.valueOf(LAT))
                        .param("longitud", String.valueOf(LON))
                        .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                        .param("categoriaId", String.valueOf(categoriaEstandarId()))
                        .header("Authorization", "Bearer " + tokenCiudadano()))
                .andExpect(status().isConflict());
        assertThatThrownBy(() -> fotoStorageService.almacenarFotoPerfil(null))
                .hasMessage("La foto está vacía");
        assertThatThrownBy(() -> fotoStorageService.almacenarFotoReporteSaneada(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void unaAdhesion_noDejaSuFotoEnElBucket() throws Exception {
        String original = nombre(subirFotoDeReporte(ImagenesDePrueba.png(64, 48)));
        Set<String> antes = claves(REPORTES);
        assertThat(antes).contains(original);

        // Mismo punto y categoria: el segundo ciudadano se adhiere (US-09). Su
        // foto se subio antes de la transaccion (BE-11) y se borra al terminar.
        crearReporteConFoto(ImagenesDePrueba.png(32, 32))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion").value(true));

        assertThat(claves(REPORTES)).isEqualTo(antes);
    }

    @Test
    void siLaCreacionSeRevierte_elBucketQuedaSinElObjeto() throws Exception {
        Set<String> antes = claves(REPORTES);
        fallaAntesDelCommit.activar();

        crearReporteConFoto(ImagenesDePrueba.png(64, 48))
                .andExpect(status().isInternalServerError());

        assertThat(claves(REPORTES)).isEqualTo(antes);
    }
}
