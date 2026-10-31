package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.clasificacion.domain.CategoriaClasificable;
import pe.edu.upc.viasegura.clasificacion.port.CategoriasClasificables;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.AdhesionReporte;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * V19 (NC-04): la clase del modelo de cada categoria, las restricciones de la
 * sugerencia y la baja de «Hueco en calzada» sin romper los reportes que ya
 * la usan. Flyway ya aplico V19 sobre la base de test al arrancar el contexto.
 */
class CategoriasDelModeloIT extends AbstractPostgisIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JdbcTemplate jdbcTemplate;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    DistritoRepository distritoRepository;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    AdhesionReporteRepository adhesionRepository;
    @Autowired
    CategoriasClasificables categoriasClasificables;

    private CategoriaDano estandar(String nombre) {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals(nombre)).findFirst().orElseThrow();
    }

    private Distrito miraflores() {
        return distritoRepository.findByNombre("Miraflores").orElseThrow();
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

    @Test
    void soloBacheYPistaDeterioradaTienenClaseDelModelo() {
        Map<String, String> clases = new LinkedHashMap<>();
        jdbcTemplate.query("SELECT nombre, clase_modelo FROM categoria_dano WHERE es_estandar ORDER BY id",
                rs -> {
                    clases.put(rs.getString("nombre"), rs.getString("clase_modelo"));
                });

        assertThat(clases).containsEntry("Bache", "bache").containsEntry("Pista deteriorada", "grieta");
        assertThat(clases).hasSize(6);
        assertThat(clases.entrySet().stream().filter(e -> e.getValue() != null)).hasSize(2);
        // Ninguna categoria de un distrito tiene clase: nunca se sugieren.
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM categoria_dano WHERE NOT es_estandar AND clase_modelo IS NOT NULL",
                Long.class)).isZero();
    }

    @Test
    void elCatalogoDelModelo_sonLasActivasConClase() {
        assertThat(categoriasClasificables.activas()).containsExactlyInAnyOrder(
                new CategoriaClasificable(estandar("Bache").getId(), "Bache", "bache"),
                new CategoriaClasificable(estandar("Pista deteriorada").getId(), "Pista deteriorada", "grieta"));
    }

    @Test
    void laClaseDelModelo_esUnicaYSoloDeEstandar() {
        long vereda = estandar("Vereda dañada").getId();
        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE categoria_dano SET clase_modelo = 'bache' WHERE id = ?", vereda))
                .isInstanceOf(DataIntegrityViolationException.class);

        Long propia = jdbcTemplate.queryForObject("INSERT INTO categoria_dano"
                + " (nombre, descripcion, es_estandar, distrito_id, activo) VALUES (?, 'x', FALSE, ?, TRUE)"
                + " RETURNING id", Long.class, "Malecon " + UUID.randomUUID(), miraflores().getId());
        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE categoria_dano SET clase_modelo = 'malecon' WHERE id = ?", propia))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void laSugerenciaVaCompletaYConConfianzaEntreCeroYUno() {
        Reporte r = reporteCon(estandar("Bache"), ciudadano());
        long bache = estandar("Bache").getId();

        assertThatThrownBy(() -> jdbcTemplate.update("UPDATE reporte SET categoria_sugerida_id = ?,"
                + " confianza_sugerencia = 1.5, version_modelo_sugerencia = 'v' WHERE id = ?", bache, r.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE reporte SET categoria_sugerida_id = ? WHERE id = ?", bache, r.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbcTemplate.update("UPDATE reporte SET categoria_sugerida_id = ?,"
                + " confianza_sugerencia = 1, version_modelo_sugerencia = 'v' WHERE id = ?", bache, r.getId()))
                .isEqualTo(1);
    }

    // --- «Hueco en calzada» ---------------------------------------------

    @Test
    void huecoEnCalzada_quedaInactivaYNoSeOfrece() throws Exception {
        CategoriaDano hueco = estandar("Hueco en calzada");
        assertThat(hueco.isActivo()).isFalse();

        mockMvc.perform(get("/api/categorias"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].nombre", not(hasItem("Hueco en calzada"))))
                .andExpect(jsonPath("$[*].nombre", hasItem("Bache")));

        // Ni por el API: crear con ella es 409, como con cualquier inactiva.
        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", "-12.1215").param("longitud", "-77.0297")
                        .param("titulo", "Hueco profundo").param("severidad", "ALTA")
                        .param("categoriaId", String.valueOf(hueco.getId()))
                        .header("Authorization", bearer(ciudadano())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is("La categoría seleccionada no está activa")));
    }

    @Test
    void unReporteQueYaUsabaHuecoEnCalzada_sigueVisibleYEditable() throws Exception {
        Usuario creador = ciudadano();
        Reporte r = reporteCon(estandar("Hueco en calzada"), creador);

        // Se sigue viendo con su categoria, en el detalle y en la busqueda publica...
        mockMvc.perform(get("/api/reportes/{id}", r.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categoriaNombre", is("Hueco en calzada")));
        mockMvc.perform(get("/api/reportes").param("distritoId", String.valueOf(miraflores().getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", hasItem(r.getId().intValue())));

        // ...y el creador puede seguir editandolo sin cambiar de categoria (US-08).
        mockMvc.perform(patch("/api/reportes/{id}", r.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"descripcion\":\"Sigue ahi\",\"categoriaId\":" + r.getCategoria().getId() + "}")
                        .header("Authorization", bearer(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categoriaNombre", is("Hueco en calzada")))
                .andExpect(jsonPath("$.descripcion", is("Sigue ahi")));
    }

    private Reporte reporteCon(CategoriaDano categoria, Usuario creador) {
        Reporte r = reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria).creador(creador).distrito(miraflores())
                .totalAdhesiones(1).build());
        adhesionRepository.save(AdhesionReporte.builder().reporte(r).usuario(creador).build());
        return r;
    }
}
