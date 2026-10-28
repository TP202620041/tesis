package pe.edu.upc.viasegura.reportes;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Tests de integracion del endpoint de creacion de reportes (US-05). */
class ReporteControllerIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores (verificado manualmente).
    private static final double LAT_MIRAFLORES = -12.1215;
    private static final double LON_MIRAFLORES = -77.0297;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    AdhesionReporteRepository adhesionRepository;
    @Autowired
    DistritoRepository distritoRepository;

    @BeforeEach
    void limpiarReportes() {
        // Estado limpio: la BD de test es persistente y ya existe acumulacion
        // (US-09), asi que evitamos interferencia entre corridas/tests.
        adhesionRepository.deleteAll();
        reporteRepository.deleteAll();
    }

    private long categoriaEstandarId() {
        CategoriaDano cat = categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("No hay categorias estandar sembradas"));
        return cat.getId();
    }

    private String tokenCiudadano() throws Exception {
        String correo = "reportero-" + UUID.randomUUID() + "@lima.pe";
        String registro = """
                {"email":"%s","password":"secreta123","nombre":"Ciro","apellido":"Vecino","aceptaTerminos":true,"versionTerminos":"%s"}
                """.formatted(correo, versionTerminos);
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro))
                .andExpect(status().isCreated());
        return confirmarEIniciarSesion(correo, "secreta123");
    }

    private MockMultipartFile fotoPng() {
        // Una imagen real: desde DEP-12 la foto se decodifica al guardarse.
        return new MockMultipartFile("foto", "bache.png", "image/png",
                pe.edu.upc.viasegura.support.ImagenesDePrueba.png(8, 8));
    }

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private long categoriaPersonalizadaDe(Distrito distrito) {
        return categoriaRepository.save(CategoriaDano.builder()
                .nombre("Personalizada " + UUID.randomUUID())
                .esEstandar(false).distrito(distrito).activo(true).build())
                .getId();
    }

    @Test
    void crearReporte_conFotoEnMiraflores_asignaDistritoAutomaticamente() throws Exception {
        String token = tokenCiudadano();

        mockMvc.perform(multipart("/api/reportes")
                        .file(fotoPng())
                        .param("latitud", String.valueOf(LAT_MIRAFLORES))
                        .param("longitud", String.valueOf(LON_MIRAFLORES))
                        .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                        .param("categoriaId", String.valueOf(categoriaEstandarId()))
                        .param("descripcion", "Bache frente al parque")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.estado", is("PENDIENTE")))
                .andExpect(jsonPath("$.distritoNombre", is("Miraflores")))
                .andExpect(jsonPath("$.fotoUrl", notNullValue()))
                .andExpect(jsonPath("$.esAdhesion", is(false)))
                .andExpect(jsonPath("$.totalAdhesiones", is(1)));
    }

    @Test
    void crearReporte_sinGpsNiUbicacionManual_devuelve400() throws Exception {
        // US-05, Escenario 2: sin coordenadas no se puede crear el reporte.
        String token = tokenCiudadano();

        mockMvc.perform(multipart("/api/reportes")
                        .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                        .param("categoriaId", String.valueOf(categoriaEstandarId()))
                        .param("descripcion", "sin gps")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void crearReporte_fueraDeCobertura_devuelve409() throws Exception {
        // Coordenadas de Arequipa: fuera de Lima Metropolitana.
        String token = tokenCiudadano();

        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", "-16.409")
                        .param("longitud", "-71.5375")
                        .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                        .param("categoriaId", String.valueOf(categoriaEstandarId()))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status", is(409)));
    }

    @Test
    void crearReporte_conCategoriaPersonalizadaDelPropioDistrito_201() throws Exception {
        // US-29: la categoria personalizada de Miraflores es valida para un
        // reporte cuya ubicacion cae dentro de Miraflores.
        String token = tokenCiudadano();
        long categoriaId = categoriaPersonalizadaDe(distrito("Miraflores"));

        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", String.valueOf(LAT_MIRAFLORES))
                        .param("longitud", String.valueOf(LON_MIRAFLORES))
                        .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                        .param("categoriaId", String.valueOf(categoriaId))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.distritoNombre", is("Miraflores")));
    }

    @Test
    void crearReporte_conCategoriaPersonalizadaDeOtroDistrito_409() throws Exception {
        // US-29, caso limite explicito: una categoria personalizada de
        // Santiago de Surco NO es usable para un reporte que cae en
        // Miraflores (point-in-polygon asigna Miraflores por las coords).
        String token = tokenCiudadano();
        long categoriaDeSurco = categoriaPersonalizadaDe(distrito("Santiago de Surco"));

        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", String.valueOf(LAT_MIRAFLORES))
                        .param("longitud", String.valueOf(LON_MIRAFLORES))
                        .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                        .param("categoriaId", String.valueOf(categoriaDeSurco))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict());
    }

    @Test
    void crearReporte_sinToken_devuelve401() throws Exception {
        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", String.valueOf(LAT_MIRAFLORES))
                        .param("longitud", String.valueOf(LON_MIRAFLORES))
                        .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                        .param("categoriaId", String.valueOf(categoriaEstandarId())))
                .andExpect(status().isUnauthorized());
    }
}
