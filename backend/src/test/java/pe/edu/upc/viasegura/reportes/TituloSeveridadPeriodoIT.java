package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * NC-02: titulo y severidad obligatorios al crear, editables en PENDIENTE,
 * publicos en los DTO del reporte, y el periodo de gestion asignado por la
 * fecha de creacion.
 */
class TituloSeveridadPeriodoIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    JdbcTemplate jdbc;

    private long categoriaEstandarId() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar)
                .findFirst()
                .orElseThrow()
                .getId();
    }

    private String tokenCiudadano() throws Exception {
        String correo = "nc02-" + UUID.randomUUID() + "@lima.pe";
        MvcResult res = mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"secreta123","nombre":"Rosa","apellido":"Vecina","aceptaTerminos":true,"versionTerminos":"%s"}
                                """.formatted(correo, versionTerminos)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
    }

    /** {@code null} en titulo o severidad: no se envia ese parametro. */
    private ResultActions crear(String token, String titulo, String severidad) throws Exception {
        MockHttpServletRequestBuilder req = multipart("/api/reportes")
                .param("latitud", String.valueOf(LAT))
                .param("longitud", String.valueOf(LON))
                .param("categoriaId", String.valueOf(categoriaEstandarId()))
                .header("Authorization", "Bearer " + token);
        if (titulo != null) {
            req = req.param("titulo", titulo);
        }
        if (severidad != null) {
            req = req.param("severidad", severidad);
        }
        return mockMvc.perform(req);
    }

    private long idDe(MvcResult res) throws Exception {
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asLong();
    }

    @Test
    void crear_guardaTituloSinEspaciosYSeveridad_yLosDevuelve() throws Exception {
        MvcResult res = crear(tokenCiudadano(), "   Bache profundo en la berma  ", "ALTA")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.titulo", is("Bache profundo en la berma")))
                .andExpect(jsonPath("$.severidad", is("ALTA")))
                .andReturn();

        assertThat(jdbc.queryForObject("SELECT titulo FROM reporte WHERE id = ?", String.class, idDe(res)))
                .isEqualTo("Bache profundo en la berma");
    }

    @Test
    void crear_asignaElPeriodoDeGestionDeSuFechaDeCreacion() throws Exception {
        // El periodo esperado es el que contiene la fecha de creacion, o nulo si
        // ninguno la contiene: el test no depende de que hoy caiga en 2023-2026.
        long id = idDe(crear(tokenCiudadano(), "Bache en la esquina", "MEDIA")
                .andExpect(status().isCreated()).andReturn());

        Long periodo = jdbc.queryForObject("SELECT periodo_gestion_id FROM reporte WHERE id = ?", Long.class, id);
        Long esperado = jdbc.queryForObject("""
                SELECT (SELECT p.id FROM periodo_gestion p
                         WHERE (r.created_at AT TIME ZONE 'America/Lima')::date
                               BETWEEN p.fecha_inicio AND p.fecha_fin)
                  FROM reporte r WHERE r.id = ?
                """, Long.class, id);
        assertThat(periodo).isEqualTo(esperado);
    }

    @Test
    void crear_sinTitulo_400ConMensajeDeCampo() throws Exception {
        crear(tokenCiudadano(), null, "MEDIA")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("título")));
    }

    @ParameterizedTest(name = "titulo «{0}» -> 400")
    @ValueSource(strings = {"    ", "Bach", "   Bach   "})
    void crear_tituloDeMenosDe5TrasTrim_400(String titulo) throws Exception {
        crear(tokenCiudadano(), titulo, "MEDIA")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("título")));
    }

    @Test
    void crear_tituloDe121_400_y120_valido() throws Exception {
        String token = tokenCiudadano();
        crear(token, "x".repeat(121), "MEDIA").andExpect(status().isBadRequest());
        crear(token, "x".repeat(120), "MEDIA").andExpect(status().isCreated());
    }

    @Test
    void crear_tituloDeExactamente5TrasTrim_valido() throws Exception {
        crear(tokenCiudadano(), "  Bache  ", "MEDIA")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.titulo", is("Bache")));
    }

    @Test
    void crear_sinSeveridad_400ConMensajeDeCampo() throws Exception {
        crear(tokenCiudadano(), "Bache en la esquina", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("severidad")));
    }

    @Test
    void crear_severidadFueraDelEnum_400() throws Exception {
        crear(tokenCiudadano(), "Bache en la esquina", "CRITICA")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("severidad")));
    }

    @Test
    void elDetallePublico_incluyeTituloYSeveridad() throws Exception {
        long id = idDe(crear(tokenCiudadano(), "Hueco frente al colegio", "BAJA")
                .andExpect(status().isCreated()).andReturn());

        mockMvc.perform(get("/api/reportes/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.titulo", is("Hueco frente al colegio")))
                .andExpect(jsonPath("$.severidad", is("BAJA")));
    }

    @Test
    void editarEnPendiente_cambiaTituloYSeveridad_yValidaElTitulo() throws Exception {
        String token = tokenCiudadano();
        long id = idDe(crear(token, "Bache en la esquina", "BAJA")
                .andExpect(status().isCreated()).andReturn());

        mockMvc.perform(patch("/api/reportes/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"titulo\":\"  Bache grande en la esquina \",\"severidad\":\"ALTA\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.titulo", is("Bache grande en la esquina")))
                .andExpect(jsonPath("$.severidad", is("ALTA")));

        mockMvc.perform(patch("/api/reportes/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"titulo\":\"abc\"}"))
                .andExpect(status().isBadRequest());

        // Sin titulo ni severidad en el PATCH: no se tocan.
        mockMvc.perform(patch("/api/reportes/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"descripcion\":\"Cada vez mas grande\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.titulo", is("Bache grande en la esquina")))
                .andExpect(jsonPath("$.severidad", is("ALTA")));
    }
}
