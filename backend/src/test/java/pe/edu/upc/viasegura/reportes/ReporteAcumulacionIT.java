package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Tests de acumulacion de reportes duplicados (US-09). */
class ReporteAcumulacionIT extends AbstractPostgisIT {

    // Punto base en Miraflores (cubierto por un distrito).
    private static final double BASE_LAT = -12.1215;
    private static final double BASE_LON = -77.0297;
    // ~30 m al sur del punto base: fuera del radio de 20 m (1 grado lat ~ 111.3 km).
    private static final double LEJOS_LAT = BASE_LAT - 0.00027;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    AdhesionReporteRepository adhesionRepository;

    @BeforeEach
    void limpiar() {
        adhesionRepository.deleteAll();
        reporteRepository.deleteAll();
    }

    private List<Long> dosCategoriasEstandar() {
        List<Long> ids = categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar)
                .map(CategoriaDano::getId)
                .limit(2)
                .toList();
        if (ids.size() < 2) {
            throw new IllegalStateException("Se requieren >= 2 categorias estandar");
        }
        return ids;
    }

    private String tokenCiudadano() throws Exception {
        String correo = "ciudadano-" + UUID.randomUUID() + "@lima.pe";
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"secreta123","nombre":"Ciro","apellido":"Vecino","aceptaTerminos":true,"versionTerminos":"%s"}
                                """.formatted(correo, versionTerminos)))
                .andExpect(status().isCreated());
        return confirmarEIniciarSesion(correo, "secreta123");
    }

    private ResultActions crearReporte(String token, double lat, double lon, long categoriaId) throws Exception {
        return mockMvc.perform(multipart("/api/reportes")
                .param("latitud", String.valueOf(lat))
                .param("longitud", String.valueOf(lon))
                .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                        .param("categoriaId", String.valueOf(categoriaId))
                .header("Authorization", "Bearer " + token));
    }

    @Test
    void mismoPuntoMismaCategoria_seAcumulaNoSeDuplica() throws Exception {
        long categoria = dosCategoriasEstandar().get(0);

        // Ciudadano A crea el reporte original.
        crearReporte(tokenCiudadano(), BASE_LAT, BASE_LON, categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)))
                .andExpect(jsonPath("$.totalAdhesiones", is(1)));

        // Ciudadano B reporta el mismo punto y categoria: se adhiere.
        crearReporte(tokenCiudadano(), BASE_LAT, BASE_LON, categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(true)))
                .andExpect(jsonPath("$.totalAdhesiones", is(2)));

        assertThat(reporteRepository.count()).isEqualTo(1);   // no se duplico
        assertThat(adhesionRepository.count()).isEqualTo(2);  // A (creador) + B
    }

    @Test
    void mismoPuntoCategoriaDistinta_creaReporteIndependiente() throws Exception {
        // US-09, Escenario 2: dano distinto en el mismo punto no se acumula.
        List<Long> categorias = dosCategoriasEstandar();

        crearReporte(tokenCiudadano(), BASE_LAT, BASE_LON, categorias.get(0))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)));

        crearReporte(tokenCiudadano(), BASE_LAT, BASE_LON, categorias.get(1))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)));

        assertThat(reporteRepository.count()).isEqualTo(2);
    }

    @Test
    void puntoFueraDelRadio_mismaCategoria_noSeAcumula() throws Exception {
        // ~30 m de distancia (> 20 m): debe crear un reporte independiente.
        long categoria = dosCategoriasEstandar().get(0);

        crearReporte(tokenCiudadano(), BASE_LAT, BASE_LON, categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)));

        crearReporte(tokenCiudadano(), LEJOS_LAT, BASE_LON, categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)));

        assertThat(reporteRepository.count()).isEqualTo(2);
    }

    @Test
    void mismoCiudadanoDosVeces_devuelve409() throws Exception {
        long categoria = dosCategoriasEstandar().get(0);
        String token = tokenCiudadano();

        crearReporte(token, BASE_LAT, BASE_LON, categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)));

        // El mismo ciudadano (ya es creador/afectado) intenta reportar otra vez.
        crearReporte(token, BASE_LAT, BASE_LON, categoria)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status", is(409)));

        assertThat(reporteRepository.count()).isEqualTo(1);
        assertThat(adhesionRepository.count()).isEqualTo(1);
    }
}
