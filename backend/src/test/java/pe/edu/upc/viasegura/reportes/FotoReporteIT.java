package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * Las fotos de evidencia de un reporte (US-05) se pueden descargar por la
 * {@code fotoUrl} que devuelve el API, sin autenticacion.
 *
 * <p>Cierra un hueco real: antes las fotos se guardaban pero ninguna ruta las
 * servia, asi que toda {@code fotoUrl} apuntaba a un 401. Desde DEP-12 la
 * foto se guarda saneada (JPEG sin EXIF) y la ruta publica la lee por el
 * puerto de almacenamiento; aqui, con el adaptador local.</p>
 */
class FotoReporteIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    CategoriaDanoRepository categoriaRepository;

    private long categoriaEstandarId() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("No hay categorias estandar sembradas"))
                .getId();
    }

    private String tokenCiudadano() throws Exception {
        MvcResult res = mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"foto-%s@lima.pe","password":"secreta123","nombre":"Ana","apellido":"Vecina","aceptaTerminos":true,"versionTerminos":"%s"}
                                """.formatted(UUID.randomUUID(), versionTerminos)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
    }

    private ResultActions crearReporte(MockMultipartFile foto) throws Exception {
        return mockMvc.perform(multipart("/api/reportes")
                .file(foto)
                .param("latitud", String.valueOf(LAT))
                .param("longitud", String.valueOf(LON))
                .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                .param("categoriaId", String.valueOf(categoriaEstandarId()))
                .header("Authorization", "Bearer " + tokenCiudadano()));
    }

    /** Crea un reporte con foto y devuelve la `fotoUrl` que entrega el API. */
    private String crearReporteConFoto(byte[] foto, String nombre) throws Exception {
        MvcResult res = crearReporte(new MockMultipartFile("foto", nombre, "image/jpeg", foto))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("fotoUrl").asText();
    }

    @Test
    void laFotoUrlDevueltaSePuedeDescargarSinToken() throws Exception {
        String fotoUrl = crearReporteConFoto(ImagenesDePrueba.png(64, 48), "bache.png");

        // La URL debe apuntar al subdirectorio publico, no al de perfiles.
        assertThat(fotoUrl).startsWith("/media/fotos/reportes/").endsWith(".jpg");

        MvcResult descarga = mockMvc.perform(get(fotoUrl))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andReturn();

        // No basta con el 200: el cuerpo es la foto subida, ya como JPEG.
        byte[] cuerpo = descarga.getResponse().getContentAsByteArray();
        assertThat(ImagenesDePrueba.leer(cuerpo).getWidth()).isEqualTo(64);
        assertThat(ImagenesDePrueba.leer(cuerpo).getHeight()).isEqualTo(48);
    }

    @Test
    void laFotoDescargadaYaNoTraeElExifDelTelefono() throws Exception {
        byte[] original = ImagenesDePrueba.jpegConExif(300, 200, 6);
        String fotoUrl = crearReporteConFoto(original, "IMG_1234.JPG");

        byte[] descargada = mockMvc.perform(get(fotoUrl))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        // Ni la ubicacion GPS ni el fabricante del telefono llegan al mapa publico.
        assertThat(ImagenesDePrueba.tieneApp1(descargada)).isFalse();
        assertThat(ImagenesDePrueba.contiene(descargada, ImagenesDePrueba.MARCA_EXIF)).isFalse();
        // Y se ve derecha: la orientacion 6 ya se aplico a los pixeles.
        assertThat(ImagenesDePrueba.leer(descargada).getWidth()).isEqualTo(200);
        assertThat(ImagenesDePrueba.leer(descargada).getHeight()).isEqualTo(300);
    }

    @Test
    void laFotoPublicaSeCacheaYAdmiteGetCondicionalYRangos() throws Exception {
        String fotoUrl = crearReporteConFoto(ImagenesDePrueba.png(64, 48), "bache.png");

        MvcResult descarga = mockMvc.perform(get(fotoUrl))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "max-age=2592000, public, immutable"))
                .andReturn();
        String modificada = descarga.getResponse().getHeader(HttpHeaders.LAST_MODIFIED);
        assertThat(modificada).isNotBlank();

        mockMvc.perform(get(fotoUrl).header(HttpHeaders.IF_MODIFIED_SINCE, modificada))
                .andExpect(status().isNotModified());
        MvcResult rango = mockMvc.perform(get(fotoUrl).header(HttpHeaders.RANGE, "bytes=0-9"))
                .andExpect(status().isPartialContent())
                .andReturn();
        assertThat(rango.getResponse().getContentAsByteArray())
                .containsExactly(java.util.Arrays.copyOf(descarga.getResponse().getContentAsByteArray(), 10));
    }

    @Test
    void unArchivoQueNoEsImagen_409ConElMensajeDeFormato() throws Exception {
        crearReporte(new MockMultipartFile("foto", "bache.png", "image/png",
                        new byte[] {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3, 4}))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Formato de foto no permitido")));
    }

    @Test
    void unaFotoInexistente_devuelve404NoUn401() throws Exception {
        // Confirma que la ruta esta realmente abierta: si siguiera protegida,
        // esto responderia 401 en vez de 404.
        mockMvc.perform(get("/media/fotos/reportes/" + UUID.randomUUID() + ".png"))
                .andExpect(status().isNotFound());
    }

    @Test
    void unNombreQueNoEsDeUnaFoto_404SinTocarElAlmacenamiento() throws Exception {
        for (String nombre : new String[] {"hola.txt", "application.yml", "sub/" + UUID.randomUUID() + ".jpg",
                UUID.randomUUID() + ".jpg.exe"}) {
            mockMvc.perform(get("/media/fotos/reportes/" + nombre))
                    .andExpect(status().isNotFound());
        }
        // Rutas con ".." codificado: las frena antes el firewall de Spring
        // Security (400) o el resource handler; nunca devuelven contenido.
        for (String intento : new String[] {"..%2F..%2Fapplication.yml", "%2E%2E%2Fperfiles%2Fx.jpg"}) {
            MvcResult res = mockMvc.perform(get("/media/fotos/reportes/" + intento)).andReturn();
            assertThat(res.getResponse().getStatus()).as(intento).isBetween(400, 499);
            assertThat(res.getResponse().getContentType()).as(intento).isNotEqualTo("image/jpeg");
        }
    }

    @Test
    void elDirectorioDeFotosDePerfilNoSeSirveComoEstatico() throws Exception {
        // Solo se abrio /media/fotos/reportes/**. Las fotos de perfil viven
        // aparte y solo salen por el endpoint que valida al dueno; servirlas
        // aqui las expondria a cualquiera.
        mockMvc.perform(get("/media/fotos/perfiles/" + UUID.randomUUID() + ".png"))
                .andExpect(status().isUnauthorized());
    }
}
