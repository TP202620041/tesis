package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * La IA nunca bloquea un reporte (NC-04, ARCHITECTURE.md 4.3): con el servicio
 * de clasificacion caido (el falso en modo {@code falla}), el reporte se crea
 * igual, su foto se publica y la sugerencia queda nula; la vista previa
 * responde «sin sugerencia» y no un error.
 *
 * <p>Su propio contexto de Spring (otra propiedad), el unico que agrega
 * NC-04.</p>
 */
@TestPropertySource(properties = "app.clasificacion.falso.respuesta=falla")
class SugerenciaCategoriaFallaIT extends AbstractPostgisIT {

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

    private String bearerCiudadano() {
        Usuario u = guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private long bache() {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals("Bache")).map(CategoriaDano::getId).findFirst().orElseThrow();
    }

    private static MockMultipartFile foto() {
        return new MockMultipartFile("foto", "bache.png", "image/png", ImagenesDePrueba.png(64, 48));
    }

    @Test
    void conElClasificadorCaido_elReporteSeCreaIgualYSinSugerencia() throws Exception {
        String cuerpo = mockMvc.perform(multipart("/api/reportes").file(foto())
                        .param("latitud", "-12.1215").param("longitud", "-77.0297")
                        .param("titulo", "Hueco frente al parque").param("severidad", "ALTA")
                        .param("categoriaId", String.valueOf(bache()))
                        .header("Authorization", bearerCiudadano()))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode creado = objectMapper.readTree(cuerpo);

        Map<String, Object> fila = jdbcTemplate.queryForMap("SELECT categoria_sugerida_id, confianza_sugerencia,"
                + " version_modelo_sugerencia FROM reporte WHERE id = ?", creado.get("id").asLong());
        assertThat(fila.values()).containsOnlyNulls();
        // Y la foto quedo guardada y publica: solo falto la sugerencia.
        mockMvc.perform(get(creado.get("fotoUrl").asText())).andExpect(status().isOk());
    }

    @Test
    void conElClasificadorCaido_laVistaPreviaEsSinSugerencia() throws Exception {
        mockMvc.perform(multipart("/api/clasificaciones").file(foto())
                        .header("Authorization", bearerCiudadano()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categoriaId", nullValue()))
                .andExpect(jsonPath("$.categoriaNombre", nullValue()));
    }
}
