package pe.edu.upc.viasegura.reportes;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * SEC-02 (US-27): {@code posibleReincidencia} es una senal interna que
 * dirige la atencion municipal. Fija el contrato <b>campo por campo y
 * endpoint por endpoint</b>: ningun endpoint que pueda leer quien solo
 * consulta (anonimo o ciudadano) lo devuelve, ni siquiera con el reporte
 * marcado; los dos de gestion del funcionario si.
 *
 * <p>Cada caso usa un reporte con el flag en {@code true}: un campo ausente
 * en un reporte sin marcar no probaria nada. Y cada uno afirma primero que
 * el reporte esta en la respuesta, para que el {@code doesNotExist} no pase
 * sobre una lista vacia.</p>
 */
class SenalInternaFueraDeDtosPublicosIT extends AbstractPostgisIT {

    private static final String FLAG = "posibleReincidencia";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    DistritoRepository distritoRepository;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;

    private Distrito miraflores() {
        return distritoRepository.findByNombre("Miraflores").orElseThrow();
    }

    private CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
    }

    private Usuario ciudadano() {
        return usuarioRepository.save(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private Usuario funcionario() {
        return usuarioRepository.save(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).distrito(miraflores()).build());
    }

    /** Reporte de Miraflores con el detector ya disparado. */
    private Reporte marcado(EstadoReporte estado, Usuario creador, Instant resolvedAt) {
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria()).creador(creador).distrito(miraflores())
                .estado(estado).totalAdhesiones(1).resolvedAt(resolvedAt)
                .posibleReincidencia(true).build());
    }

    private String bearer(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private static String porId(Reporte r) {
        return "$[?(@.id == %d)]".formatted(r.getId());
    }

    // --- Publicos (sin token) ---------------------------------------------

    @Test
    void busquedaPublica_noExponeElFlag() throws Exception {
        Reporte r = marcado(EstadoReporte.RESUELTO, ciudadano(), Instant.now());

        mockMvc.perform(get("/api/reportes")
                        .param("distritoId", String.valueOf(miraflores().getId()))
                        .param("size", "200"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", hasItem(r.getId().intValue())))
                .andExpect(jsonPath("$.content[*]." + FLAG).doesNotExist());
    }

    @Test
    void busquedaPublicaPorArea_noExponeElFlag() throws Exception {
        // El mapa (US-10) va por otra query (buscarEnArea), mismo DTO.
        Reporte r = marcado(EstadoReporte.RESUELTO, ciudadano(), Instant.now());

        mockMvc.perform(get("/api/reportes")
                        .param("minLat", "-12.13").param("minLon", "-77.04")
                        .param("maxLat", "-12.11").param("maxLon", "-77.02")
                        .param("size", "200"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", hasItem(r.getId().intValue())))
                .andExpect(jsonPath("$.content[*]." + FLAG).doesNotExist());
    }

    @Test
    void detallePublico_noExponeElFlag() throws Exception {
        Reporte r = marcado(EstadoReporte.RESUELTO, ciudadano(), Instant.now());

        mockMvc.perform(get("/api/reportes/{id}", r.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(r.getId().intValue())))
                .andExpect(jsonPath("$." + FLAG).doesNotExist());
    }

    // --- Ciudadano --------------------------------------------------------

    @Test
    void misReportes_noExponeElFlag_niAlCreador() throws Exception {
        Usuario creador = ciudadano();
        Reporte r = marcado(EstadoReporte.RESUELTO, creador, Instant.now());

        mockMvc.perform(get("/api/reportes/mis-reportes").header("Authorization", bearer(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem(r.getId().intValue())))
                .andExpect(jsonPath("$[*]." + FLAG).doesNotExist());
    }

    @Test
    void pendientesDeCalificacion_noExponeElFlag() throws Exception {
        Usuario creador = ciudadano();
        Reporte r = marcado(EstadoReporte.RESUELTO, creador, Instant.now().minus(4, ChronoUnit.DAYS));

        mockMvc.perform(get("/api/reportes/mis-reportes/pendientes-calificacion")
                        .header("Authorization", bearer(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem(r.getId().intValue())))
                .andExpect(jsonPath("$[*]." + FLAG).doesNotExist());
    }

    @Test
    void editar_noExponeElFlag() throws Exception {
        Usuario creador = ciudadano();
        Reporte r = marcado(EstadoReporte.PENDIENTE, creador, null);

        mockMvc.perform(patch("/api/reportes/{id}", r.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"descripcion\":\"Ahora es mas profundo\"}")
                        .header("Authorization", bearer(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(r.getId().intValue())))
                .andExpect(jsonPath("$." + FLAG).doesNotExist());
    }

    @Test
    void cancelar_noExponeElFlag() throws Exception {
        Usuario creador = ciudadano();
        Reporte r = marcado(EstadoReporte.PENDIENTE, creador, null);

        mockMvc.perform(delete("/api/reportes/{id}", r.getId()).header("Authorization", bearer(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado", is("CANCELADO")))
                .andExpect(jsonPath("$." + FLAG).doesNotExist());
    }

    @Test
    void crearOAdherirse_noExponeElFlag() throws Exception {
        // Junto a un reporte marcado de la misma categoria: el POST termina en
        // adhesion (US-09) y devuelve ESE reporte; tampoco debe llevar el flag.
        Reporte r = marcado(EstadoReporte.PENDIENTE, ciudadano(), null);

        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", "-12.1215")
                        .param("longitud", "-77.0297")
                        .param("categoriaId", String.valueOf(categoria().getId()))
                        .header("Authorization", bearer(ciudadano())))
                .andExpect(status().is2xxSuccessful())
                .andExpect(jsonPath("$.id", is(r.getId().intValue())))
                .andExpect(jsonPath("$.esAdhesion", is(true)))
                .andExpect(jsonPath("$." + FLAG).doesNotExist());
    }

    // --- Funcionario: el unico que lo ve ----------------------------------

    @Test
    void bandeja_siExponeElFlag() throws Exception {
        Reporte r = marcado(EstadoReporte.RESUELTO, ciudadano(), Instant.now());

        mockMvc.perform(get("/api/reportes/bandeja").header("Authorization", bearer(funcionario())))
                .andExpect(status().isOk())
                .andExpect(jsonPath(porId(r) + "." + FLAG, contains(true)));
    }

    @Test
    void cambiarEstado_siExponeElFlag() throws Exception {
        Reporte r = marcado(EstadoReporte.PENDIENTE, ciudadano(), null);

        mockMvc.perform(patch("/api/reportes/{id}/estado", r.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"estado\":\"RECIBIDO\"}")
                        .header("Authorization", bearer(funcionario())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado", is("RECIBIDO")))
                .andExpect(jsonPath("$." + FLAG, is(true)));
    }
}
