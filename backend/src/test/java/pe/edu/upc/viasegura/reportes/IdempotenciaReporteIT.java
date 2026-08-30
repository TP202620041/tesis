package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Idempotencia real en la creacion de reportes via el header
 * {@code Idempotency-Key} (US-06). Complementa a
 * {@link ReporteAcumulacionIT}, que cubre el 409 de acumulacion de US-09
 * en si mismo; aqui se prueba que ambos mecanismos conviven sin pisarse.
 */
class IdempotenciaReporteIT extends AbstractPostgisIT {

    // Punto base en Miraflores (cubierto por un distrito).
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    AdhesionReporteRepository adhesionRepository;
    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void limpiar() {
        adhesionRepository.deleteAll();
        reporteRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM idempotency_key");
    }

    private long categoriaEstandarId() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("No hay categorias estandar sembradas"))
                .getId();
    }

    private String tokenCiudadano() throws Exception {
        String correo = "idem-" + UUID.randomUUID() + "@lima.pe";
        MvcResult res = mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"secreta123","nombre":"Ciro","apellido":"Vecino"}
                                """.formatted(correo)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
    }

    private ResultActions crearReporte(String token, String idempotencyKey, long categoriaId) throws Exception {
        MockHttpServletRequestBuilder request = multipart("/api/reportes")
                .param("latitud", String.valueOf(LAT))
                .param("longitud", String.valueOf(LON))
                .param("categoriaId", String.valueOf(categoriaId))
                .header("Authorization", "Bearer " + token);
        if (idempotencyKey != null) {
            request = request.header("Idempotency-Key", idempotencyKey);
        }
        return mockMvc.perform(request);
    }

    private void vencerClave(String clave) {
        jdbcTemplate.update("UPDATE idempotency_key SET expires_at = ? WHERE clave = ?",
                Timestamp.from(Instant.now().minus(1, ChronoUnit.HOURS)), clave);
    }

    @Test
    void mismaClave_dosVeces_devuelveLaMismaRespuestaSinDuplicar() throws Exception {
        long categoria = categoriaEstandarId();
        String token = tokenCiudadano();
        String clave = UUID.randomUUID().toString();

        MvcResult primera = crearReporte(token, clave, categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)))
                .andExpect(jsonPath("$.totalAdhesiones", is(1)))
                .andReturn();

        MvcResult segunda = crearReporte(token, clave, categoria)
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode primero = objectMapper.readTree(primera.getResponse().getContentAsString());
        JsonNode segundo = objectMapper.readTree(segunda.getResponse().getContentAsString());
        assertThat(segundo).isEqualTo(primero);

        // No se re-ejecuto la logica de negocio: sigue habiendo 1 solo
        // reporte y 1 sola adhesion (no una segunda por el reintento).
        assertThat(reporteRepository.count()).isEqualTo(1);
        assertThat(adhesionRepository.count()).isEqualTo(1);
    }

    @Test
    void mismaClaveEnAdhesion_dosVeces_noCreaSegundaAdhesion() throws Exception {
        long categoria = categoriaEstandarId();
        String tokenA = tokenCiudadano();
        String tokenB = tokenCiudadano();
        String claveB = UUID.randomUUID().toString();

        crearReporte(tokenA, UUID.randomUUID().toString(), categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)));

        MvcResult primera = crearReporte(tokenB, claveB, categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(true)))
                .andExpect(jsonPath("$.totalAdhesiones", is(2)))
                .andReturn();

        MvcResult segunda = crearReporte(tokenB, claveB, categoria)
                .andExpect(status().isCreated())
                .andReturn();

        assertThat(objectMapper.readTree(segunda.getResponse().getContentAsString()))
                .isEqualTo(objectMapper.readTree(primera.getResponse().getContentAsString()));
        assertThat(reporteRepository.count()).isEqualTo(1);
        assertThat(adhesionRepository.count()).isEqualTo(2);
    }

    @Test
    void sinHeaderIdempotencyKey_comportamientoActualSinCambios() throws Exception {
        long categoria = categoriaEstandarId();
        String token = tokenCiudadano();

        crearReporte(token, null, categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)));

        // Regresion: sin el header, el comportamiento es el mismo que antes
        // de US-06 -- el mismo ciudadano reportando otra vez el mismo punto
        // sigue devolviendo el 409 de acumulacion de US-09 (ya probado en
        // ReporteAcumulacionIT#mismoCiudadanoDosVeces_devuelve409).
        crearReporte(token, null, categoria)
                .andExpect(status().isConflict());

        assertThat(reporteRepository.count()).isEqualTo(1);
        assertThat(adhesionRepository.count()).isEqualTo(1);
    }

    @Test
    void claveDeIdempotenciaDistinta_mismoPuntoYCategoria_sigueAplicandoEl409DeUS09() throws Exception {
        long categoria = categoriaEstandarId();
        String token = tokenCiudadano();

        crearReporte(token, UUID.randomUUID().toString(), categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)));

        // Clave DISTINTA a la del primer intento: no es "el mismo intento
        // reenviado", es un intento nuevo -> se ejecuta US-09 normalmente
        // y devuelve 409 (el ciudadano ya esta adherido a ese reporte).
        // Confirma que ambos mecanismos conviven sin pisarse.
        crearReporte(token, UUID.randomUUID().toString(), categoria)
                .andExpect(status().isConflict());
    }

    @Test
    void claveDeIdempotenciaVencida_seTrataComoUnIntentoNuevo() throws Exception {
        long categoria = categoriaEstandarId();
        String token = tokenCiudadano();
        String clave = UUID.randomUUID().toString();

        crearReporte(token, clave, categoria)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)));

        vencerClave(clave);

        // La clave vencio (fuera de la vigencia de 48h): NO se devuelve la
        // respuesta cacheada, se re-ejecuta la logica real -- que a su vez
        // aplica el 409 de US-09 porque el mismo ciudadano ya esta
        // adherido a ese reporte.
        crearReporte(token, clave, categoria)
                .andExpect(status().isConflict());
    }
}
