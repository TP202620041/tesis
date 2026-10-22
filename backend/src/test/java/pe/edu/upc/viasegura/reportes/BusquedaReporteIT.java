package pe.edu.upc.viasegura.reportes;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Busqueda publica de reportes por filtros (US-12) y area de mapa (US-10). */
class BusquedaReporteIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT_MIRAFLORES = -12.1215;
    private static final double LON_MIRAFLORES = -77.0297;
    // Jockey Plaza, Santiago de Surco (lejos de Miraflores).
    private static final double LAT_SURCO = -12.0855;
    private static final double LON_SURCO = -76.9756;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    DistritoRepository distritoRepository;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private Reporte reporte(double lat, double lon, Distrito distrito, EstadoReporte estado) {
        return reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(lon, lat))
                .categoria(categoria()).creador(ciudadano()).distrito(distrito)
                .estado(estado).totalAdhesiones(1).build());
    }

    @Test
    void sinFiltros_devuelveTodosPaginado_sinToken() throws Exception {
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, distrito("Miraflores"), EstadoReporte.PENDIENTE);
        reporte(LAT_SURCO, LON_SURCO, distrito("Santiago de Surco"), EstadoReporte.RESUELTO);

        mockMvc.perform(get("/api/reportes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()", is(2)))
                .andExpect(jsonPath("$.totalElements", is(2)));
    }

    @Test
    void filtraPorDistrito() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.PENDIENTE);
        reporte(LAT_SURCO, LON_SURCO, distrito("Santiago de Surco"), EstadoReporte.PENDIENTE);

        mockMvc.perform(get("/api/reportes").param("distritoId", miraflores.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()", is(1)))
                .andExpect(jsonPath("$.content[0].distritoNombre", is("Miraflores")));
    }

    @Test
    void filtraPorEstado() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.PENDIENTE);
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.RESUELTO);

        mockMvc.perform(get("/api/reportes").param("estado", "RESUELTO"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()", is(1)))
                .andExpect(jsonPath("$.content[0].estado", is("RESUELTO")));
    }

    @Test
    void filtraPorRangoDeFechas() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.PENDIENTE);

        Instant futuro = Instant.now().plus(1, ChronoUnit.DAYS);
        mockMvc.perform(get("/api/reportes").param("fechaDesde", futuro.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()", is(0)));
    }

    @Test
    void filtraPorAreaDelMapa_incluyeSoloElPuntoDentro() throws Exception {
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, distrito("Miraflores"), EstadoReporte.PENDIENTE);
        reporte(LAT_SURCO, LON_SURCO, distrito("Santiago de Surco"), EstadoReporte.PENDIENTE);

        mockMvc.perform(get("/api/reportes")
                        .param("minLat", "-12.13").param("maxLat", "-12.11")
                        .param("minLon", "-77.04").param("maxLon", "-77.02"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()", is(1)))
                .andExpect(jsonPath("$.content[0].distritoNombre", is("Miraflores")));
    }

    @Test
    void areaDelMapaIncompleta_400() throws Exception {
        mockMvc.perform(get("/api/reportes").param("minLat", "-12.13").param("maxLat", "-12.11"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void areaDelMapaConUnSoloParametro_400() throws Exception {
        // Caso limite explicito: un unico limite suelto (los otros 3
        // ausentes) no define un rectangulo -- debe rechazarse con 400
        // claro, no ignorar el filtro en silencio ni armar una query
        // inconsistente con parametros nulos hacia ST_MakeEnvelope.
        mockMvc.perform(get("/api/reportes").param("minLat", "-12.13"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void paginacion_respetaSize() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.PENDIENTE);
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.PENDIENTE);
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.PENDIENTE);

        mockMvc.perform(get("/api/reportes").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()", is(2)))
                .andExpect(jsonPath("$.totalElements", is(3)))
                .andExpect(jsonPath("$.totalPages", is(2)));
    }

    // --- Detalle publico de un reporte --------------------------------------

    @Test
    void detallePorId_esPublicoSinToken() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Reporte r = reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.RESUELTO);

        mockMvc.perform(get("/api/reportes/{id}", r.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(r.getId().intValue())))
                .andExpect(jsonPath("$.estado", is("RESUELTO")))
                .andExpect(jsonPath("$.distritoNombre", is("Miraflores")));
    }

    @Test
    void detallePorId_noExpone_identidadDelCreador() throws Exception {
        // Mismo DTO que la busqueda publica: nada de correo ni nombre.
        Distrito miraflores = distrito("Miraflores");
        Reporte r = reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.RESUELTO);

        mockMvc.perform(get("/api/reportes/{id}", r.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.creador").doesNotExist())
                .andExpect(jsonPath("$.creadorId").doesNotExist())
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void detalleDeUnReporteInexistente_404() throws Exception {
        mockMvc.perform(get("/api/reportes/{id}", 999_999)).andExpect(status().isNotFound());
    }

    @Test
    void detalleDeUnCancelado_404() throws Exception {
        // El ciudadano lo retiro: no es informacion publica, igual que en la
        // busqueda. Su creador lo sigue viendo en "mis reportes".
        Distrito miraflores = distrito("Miraflores");
        Reporte r = reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.CANCELADO);

        mockMvc.perform(get("/api/reportes/{id}", r.getId())).andExpect(status().isNotFound());
    }

    @Test
    void laRutaPublicaDeDetalleNoAbreLasRutasPrivadasHermanas() throws Exception {
        // REGRESION: un matcher `/api/reportes/*` habria hecho publicas
        // tambien /mis-reportes, /bandeja y /exportar. El id se acota a
        // digitos justamente para evitarlo.
        mockMvc.perform(get("/api/reportes/mis-reportes")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/reportes/bandeja")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/reportes/exportar")).andExpect(status().isUnauthorized());
    }

    // --- Reportes cancelados (US-08) fuera del mapa publico -----------------
    // Un CANCELADO lo retiro el propio ciudadano estando PENDIENTE: nunca
    // entro al flujo municipal y el dano puede ni existir, asi que en el mapa
    // publico (US-10) desinformaria. Mismo criterio que la vista de desempeno
    // (V7). RECHAZADO si aparece: ahi decidio la municipalidad.

    @Test
    void sinFiltroDeEstado_noDevuelveLosCancelados() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.PENDIENTE);
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.CANCELADO);

        mockMvc.perform(get("/api/reportes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].estado", is("PENDIENTE")));
    }

    @Test
    void pidiendoloExplicitamente_siDevuelveLosCancelados() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.PENDIENTE);
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.CANCELADO);

        // Se excluyen por defecto, no se ocultan: quien los pida los obtiene.
        mockMvc.perform(get("/api/reportes").param("estado", "CANCELADO"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].estado", is("CANCELADO")));
    }

    @Test
    void rechazadoSiApareceSinFiltro_aDiferenciaDeCancelado() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.RECHAZADO);
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.CANCELADO);

        mockMvc.perform(get("/api/reportes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].estado", is("RECHAZADO")));
    }

    @Test
    void enElAreaDelMapa_tampocoAparecenLosCancelados() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.PENDIENTE);
        reporte(LAT_MIRAFLORES, LON_MIRAFLORES, miraflores, EstadoReporte.CANCELADO);

        // La consulta del bbox es un metodo aparte (buscarEnArea): hay que
        // verificarla por separado o la regla se aplicaria a medias.
        mockMvc.perform(get("/api/reportes")
                        .param("minLat", "-12.13").param("maxLat", "-12.11")
                        .param("minLon", "-77.04").param("maxLon", "-77.02"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].estado", is("PENDIENTE")));
    }

    // ---- US-12: validacion de fechas y parametros mal tipados ----

    /** Fija created_at: el auditing de JPA lo sobrescribe en cada save. */
    private Reporte reporteCreadoEn(Instant creadoEn) {
        Reporte r = reporte(LAT_MIRAFLORES, LON_MIRAFLORES, distrito("Miraflores"), EstadoReporte.PENDIENTE);
        jdbcTemplate.update("UPDATE reporte SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.from(creadoEn), r.getId());
        return r;
    }

    @Test
    void fechaMalFormada_400_nombraElParametro() throws Exception {
        mockMvc.perform(get("/api/reportes").param("fechaDesde", "2026-13-45"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("fechaDesde")))
                .andExpect(jsonPath("$.message", not(containsString("2026-13-45"))));
        mockMvc.perform(get("/api/reportes").param("fechaHasta", "ayer"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("fechaHasta")))
                .andExpect(jsonPath("$.message", not(containsString("ayer"))));
    }

    @Test
    void estadoInvalido_400_nombraElParametro() throws Exception {
        mockMvc.perform(get("/api/reportes").param("estado", "ARREGLADO"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("estado")))
                .andExpect(jsonPath("$.message", not(containsString("ARREGLADO"))));
    }

    @Test
    void numeroMalFormado_400() throws Exception {
        mockMvc.perform(get("/api/reportes").param("distritoId", "miraflores"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("distritoId")))
                .andExpect(jsonPath("$.message", not(containsString("miraflores"))));
    }

    @Test
    void rangoInvertido_400() throws Exception {
        mockMvc.perform(get("/api/reportes")
                        .param("fechaDesde", "2026-02-01T00:00:00Z")
                        .param("fechaHasta", "2026-01-01T00:00:00Z"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", is("La fecha de inicio no puede ser posterior a la fecha de fin")));
    }

    @Test
    void fechaHasta_excluyeLosPosteriores() throws Exception {
        Reporte enero10 = reporteCreadoEn(Instant.parse("2026-01-10T12:00:00Z"));
        reporteCreadoEn(Instant.parse("2026-01-20T12:00:00Z"));

        mockMvc.perform(get("/api/reportes").param("fechaHasta", "2026-01-15T00:00:00Z"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].id", is(enero10.getId().intValue())));
    }

    @Test
    void rangoDeFechas_esInclusivoEnAmbosBordes() throws Exception {
        Instant desde = Instant.parse("2026-01-10T12:00:00Z");
        Instant hasta = Instant.parse("2026-01-20T12:00:00Z");
        reporteCreadoEn(desde);
        reporteCreadoEn(hasta);
        reporteCreadoEn(Instant.parse("2026-01-10T11:59:59Z"));
        reporteCreadoEn(Instant.parse("2026-01-20T12:00:01Z"));

        mockMvc.perform(get("/api/reportes")
                        .param("fechaDesde", desde.toString())
                        .param("fechaHasta", hasta.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(2)));
    }

    @Test
    void mismaFechaDesdeYHasta_noEsRangoInvertido() throws Exception {
        Instant instante = Instant.parse("2026-01-10T12:00:00Z");
        reporteCreadoEn(instante);

        mockMvc.perform(get("/api/reportes")
                        .param("fechaDesde", instante.toString())
                        .param("fechaHasta", instante.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements", is(1)));
    }
}
