package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.reportes.service.SugerenciaCategoriaService;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * Sugerencia oficial de categoria (NC-04, D-08): despues del commit, el
 * backend clasifica la foto guardada y escribe la sugerencia una sola vez. Lo
 * que envie el cliente para esos campos se ignora.
 *
 * <p>El clasificador es el falso de {@code application-test.yml} (un bache de
 * 0,87 y una grieta de 0,30 en cualquier foto), asi que la sugerencia esperada
 * es siempre «Bache» con 0,870. El executor de test espera a la tarea
 * asincrona: al volver el {@code POST}, la sugerencia ya esta escrita. Las
 * columnas se leen con SQL porque ningun DTO las expone.</p>
 */
class SugerenciaCategoriaIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

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
    JdbcTemplate jdbcTemplate;
    @Autowired
    SugerenciaCategoriaService sugerenciaCategoriaService;

    private long idDe(String nombreCategoria) {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals(nombreCategoria)).findFirst().orElseThrow().getId();
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private String bearer(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private static MockMultipartFile foto() {
        return new MockMultipartFile("foto", "bache.png", "image/png", ImagenesDePrueba.png(64, 48));
    }

    private MockMultipartHttpServletRequestBuilder crear(Usuario u, long categoriaId, MockMultipartFile foto) {
        MockMultipartHttpServletRequestBuilder peticion = multipart("/api/reportes");
        if (foto != null) {
            peticion.file(foto);
        }
        peticion.param("latitud", String.valueOf(LAT))
                .param("longitud", String.valueOf(LON))
                .param("titulo", "Hueco frente al parque").param("severidad", "ALTA")
                .param("categoriaId", String.valueOf(categoriaId))
                .header("Authorization", bearer(u));
        return peticion;
    }

    private long crearYDevolverId(Usuario u, long categoriaId, MockMultipartFile foto) throws Exception {
        String cuerpo = mockMvc.perform(crear(u, categoriaId, foto))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)))
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(cuerpo).get("id").asLong();
    }

    private Map<String, Object> sugerenciaDe(long reporteId) {
        return jdbcTemplate.queryForMap("SELECT categoria_id, categoria_sugerida_id, confianza_sugerencia,"
                + " version_modelo_sugerencia FROM reporte WHERE id = ?", reporteId);
    }

    private void afirmarSinSugerencia(long reporteId) {
        Map<String, Object> fila = sugerenciaDe(reporteId);
        assertThat(fila.get("categoria_sugerida_id")).isNull();
        assertThat(fila.get("confianza_sugerencia")).isNull();
        assertThat(fila.get("version_modelo_sugerencia")).isNull();
    }

    private void afirmarSugerenciaDelFalso(long reporteId) {
        Map<String, Object> fila = sugerenciaDe(reporteId);
        assertThat(((Number) fila.get("categoria_sugerida_id")).longValue()).isEqualTo(idDe("Bache"));
        assertThat((BigDecimal) fila.get("confianza_sugerencia")).isEqualByComparingTo("0.870");
        assertThat(fila.get("version_modelo_sugerencia")).isEqualTo("falso-0");
    }

    @Test
    void alCrearConFoto_seGuardaLaSugerenciaOficial() throws Exception {
        long id = crearYDevolverId(ciudadano(), idDe("Bache"), foto());

        afirmarSugerenciaDelFalso(id);
    }

    @Test
    void laSugeridaPuedeDiferirDeLaQueConfirmoElCiudadano() throws Exception {
        // El ciudadano eligio «Pista deteriorada»; el modelo sugiere «Bache». Las
        // dos quedan: es justo lo que mide la evaluacion (sugerida frente a confirmada).
        long id = crearYDevolverId(ciudadano(), idDe("Pista deteriorada"), foto());

        afirmarSugerenciaDelFalso(id);
        assertThat(((Number) sugerenciaDe(id).get("categoria_id")).longValue()).isEqualTo(idDe("Pista deteriorada"));
    }

    @Test
    void sinFoto_noHayNadaQueClasificar() throws Exception {
        long id = crearYDevolverId(ciudadano(), idDe("Bache"), null);

        afirmarSinSugerencia(id);
    }

    @Test
    void loQueEnviaElClienteParaEsosCampos_seIgnora() throws Exception {
        Usuario ciudadano = ciudadano();
        long pista = idDe("Pista deteriorada");

        // Con foto: manda la sugerencia del backend, no la del cliente.
        String cuerpo = mockMvc.perform(crear(ciudadano, idDe("Bache"), foto())
                        .param("categoriaSugeridaId", String.valueOf(pista))
                        .param("confianzaSugerencia", "0.99")
                        .param("versionModeloSugerencia", "cliente-1"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.categoriaSugeridaId").doesNotExist())
                .andExpect(jsonPath("$.confianzaSugerencia").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        afirmarSugerenciaDelFalso(objectMapper.readTree(cuerpo).get("id").asLong());

        // Sin foto: no queda nada de lo que mando el cliente. (Otra categoria, para
        // que no termine en una adhesion al reporte de arriba.)
        String sinFoto = mockMvc.perform(crear(ciudadano(), pista, null)
                        .param("categoriaSugeridaId", String.valueOf(pista))
                        .param("confianzaSugerencia", "0.99")
                        .param("versionModeloSugerencia", "cliente-1"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        afirmarSinSugerencia(objectMapper.readTree(sinFoto).get("id").asLong());
    }

    @Test
    void laSugerenciaSeEscribeUnaSolaVez() throws Exception {
        long id = crearYDevolverId(ciudadano(), idDe("Bache"), foto());
        // Otra sugerencia ya registrada (de un modelo anterior, p. ej.).
        jdbcTemplate.update("UPDATE reporte SET categoria_sugerida_id = ?, confianza_sugerencia = 0.600,"
                + " version_modelo_sugerencia = 'previa-v1' WHERE id = ?", idDe("Pista deteriorada"), id);

        // Un segundo intento sobre el mismo reporte no la reemplaza.
        sugerenciaCategoriaService.sugerir(id);

        Map<String, Object> fila = sugerenciaDe(id);
        assertThat(((Number) fila.get("categoria_sugerida_id")).longValue()).isEqualTo(idDe("Pista deteriorada"));
        assertThat((BigDecimal) fila.get("confianza_sugerencia")).isEqualByComparingTo("0.600");
        assertThat(fila.get("version_modelo_sugerencia")).isEqualTo("previa-v1");
    }

    @Test
    void unaAdhesion_noClasificaNiGuardaLaFotoDelAdherido() throws Exception {
        // El reporte original no tiene foto, asi que no tiene sugerencia...
        long id = crearYDevolverId(ciudadano(), idDe("Bache"), null);

        // ...y adherirse con foto (US-09) no lo vuelve a clasificar.
        mockMvc.perform(crear(ciudadano(), idDe("Bache"), foto()))
                .andExpect(status().is2xxSuccessful())
                .andExpect(jsonPath("$.id", is((int) id)))
                .andExpect(jsonPath("$.esAdhesion", is(true)));

        afirmarSinSugerencia(id);
        assertThat(reporteRepository.count()).isEqualTo(1);
    }

    @Test
    void editarElReporteDespues_noBorraLaSugerencia() throws Exception {
        // Las columnas son de solo lectura para JPA: el save() de la edicion no las toca.
        Usuario creador = ciudadano();
        long id = crearYDevolverId(creador, idDe("Bache"), foto());

        mockMvc.perform(patch("/api/reportes/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"descripcion\":\"Ahora es mas profundo\",\"severidad\":\"MEDIA\"}")
                        .header("Authorization", bearer(creador)))
                .andExpect(status().isOk());

        afirmarSugerenciaDelFalso(id);
    }
}
