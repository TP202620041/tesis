package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
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
 * Densidad de reportes para el mapa de calor (US-11): acceso anonimo,
 * agrupacion en grilla, filtros (distrito, categoria, estado, fechas),
 * visibilidad (SEC-01), contrato sin senales internas (SEC-02) y politica de
 * cache (Cache-Control + ETag/304).
 *
 * <p>La limpieza de {@link AbstractPostgisIT} borra todos los reportes antes
 * de cada test, asi que los conteos de celdas son exactos.</p>
 */
class DensidadReportesIT extends AbstractPostgisIT {

    private static final String URL = "/api/reportes/densidad";

    // Dos puntos a ~15 m, en la misma celda de 0.001 grados: (-12.121, -77.030).
    // Ninguna coordenada cae en la mitad de una celda (ST_SnapToGrid redondea).
    private static final double LAT_A = -12.1212;
    private static final double LON_A = -77.0297;
    private static final double LAT_B = -12.1213;
    private static final double LON_B = -77.0298;
    // Jockey Plaza, Santiago de Surco: otra celda (-12.086, -76.976).
    private static final double LAT_SURCO = -12.0857;
    private static final double LON_SURCO = -76.9758;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    JwtService jwtService;
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

    private List<CategoriaDano> estandar() {
        List<CategoriaDano> categorias = categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).toList();
        assertThat(categorias).hasSizeGreaterThanOrEqualTo(2);
        return categorias;
    }

    private Usuario usuario(Rol rol) {
        return guardarConTerminos(Usuario.builder()
                .email("dens-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(rol).build());
    }

    private Reporte reporte(double lat, double lon, String distrito, CategoriaDano categoria, EstadoReporte estado) {
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(lon, lat))
                .categoria(categoria).creador(usuario(Rol.CIUDADANO)).distrito(distrito(distrito))
                .estado(estado).totalAdhesiones(1).build());
    }

    private Reporte reporte(double lat, double lon, String distrito, EstadoReporte estado) {
        return reporte(lat, lon, distrito, estandar().get(0), estado);
    }

    private void fijarCreacion(Reporte r, Instant cuando) {
        jdbcTemplate.update("UPDATE reporte SET created_at = ? WHERE id = ?", Timestamp.from(cuando), r.getId());
    }

    @Test
    void anonimo_obtieneLaDensidadAgrupadaEnCeldas() throws Exception {
        reporte(LAT_A, LON_A, "Miraflores", EstadoReporte.PENDIENTE);
        reporte(LAT_B, LON_B, "Miraflores", EstadoReporte.EN_PROCESO);
        reporte(LAT_SURCO, LON_SURCO, "Santiago de Surco", EstadoReporte.PENDIENTE);

        mockMvc.perform(get(URL))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.celdaGrados", is(0.001)))
                .andExpect(jsonPath("$.totalReportes", is(3)))
                .andExpect(jsonPath("$.celdas", hasSize(2)))
                // De mayor a menor cantidad.
                .andExpect(jsonPath("$.celdas[0].latitud", is(-12.121)))
                .andExpect(jsonPath("$.celdas[0].longitud", is(-77.03)))
                .andExpect(jsonPath("$.celdas[0].cantidad", is(2)))
                .andExpect(jsonPath("$.celdas[1].latitud", is(-12.086)))
                .andExpect(jsonPath("$.celdas[1].longitud", is(-76.976)))
                .andExpect(jsonPath("$.celdas[1].cantidad", is(1)));
    }

    @Test
    void sinReportes_devuelveCeldasVacias() throws Exception {
        mockMvc.perform(get(URL))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReportes", is(0)))
                .andExpect(jsonPath("$.celdas", hasSize(0)));
    }

    /** SEC-02: el DTO publico solo tiene estos campos, revisados uno por uno. */
    @Test
    void contrato_soloCoordenadasYCantidad_sinSenalesInternas() throws Exception {
        Reporte r = reporte(LAT_A, LON_A, "Miraflores", EstadoReporte.PENDIENTE);
        jdbcTemplate.update("UPDATE reporte SET posible_reincidencia = true WHERE id = ?", r.getId());

        MvcResult res = mockMvc.perform(get(URL)).andExpect(status().isOk()).andReturn();
        JsonNode raiz = objectMapper.readTree(res.getResponse().getContentAsString());

        assertThat(raiz.fieldNames()).toIterable()
                .containsExactlyInAnyOrder("celdaGrados", "totalReportes", "celdas");
        assertThat(raiz.get("celdas")).hasSize(1);
        assertThat(raiz.get("celdas").get(0).fieldNames()).toIterable()
                .containsExactlyInAnyOrder("latitud", "longitud", "cantidad");
    }

    @Test
    void filtroDistrito() throws Exception {
        reporte(LAT_A, LON_A, "Miraflores", EstadoReporte.PENDIENTE);
        reporte(LAT_SURCO, LON_SURCO, "Santiago de Surco", EstadoReporte.PENDIENTE);

        mockMvc.perform(get(URL).param("distritoId", distrito("Santiago de Surco").getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReportes", is(1)))
                .andExpect(jsonPath("$.celdas", hasSize(1)))
                .andExpect(jsonPath("$.celdas[0].latitud", is(-12.086)));
    }

    @Test
    void filtroCategoria() throws Exception {
        List<CategoriaDano> categorias = estandar();
        reporte(LAT_A, LON_A, "Miraflores", categorias.get(0), EstadoReporte.PENDIENTE);
        reporte(LAT_B, LON_B, "Miraflores", categorias.get(1), EstadoReporte.PENDIENTE);
        reporte(LAT_SURCO, LON_SURCO, "Santiago de Surco", categorias.get(1), EstadoReporte.PENDIENTE);

        mockMvc.perform(get(URL).param("categoriaId", categorias.get(1).getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReportes", is(2)))
                .andExpect(jsonPath("$.celdas", hasSize(2)))
                .andExpect(jsonPath("$.celdas[0].cantidad", is(1)))
                .andExpect(jsonPath("$.celdas[1].cantidad", is(1)));
    }

    @Test
    void filtroEstado() throws Exception {
        reporte(LAT_A, LON_A, "Miraflores", EstadoReporte.RESUELTO);
        reporte(LAT_SURCO, LON_SURCO, "Santiago de Surco", EstadoReporte.PENDIENTE);

        mockMvc.perform(get(URL).param("estado", "RESUELTO"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReportes", is(1)))
                .andExpect(jsonPath("$.celdas[0].latitud", is(-12.121)));
    }

    /**
     * SEC-01: sin filtro de estado cuentan los RECHAZADO y RESUELTO (rechazar
     * no "enfria" el distrito de la municipalidad), y solo se excluye
     * CANCELADO, que unicamente puede hacer el ciudadano creador.
     */
    @Test
    void sinEstado_cuentaRechazadosYResueltos_peroNoCancelados() throws Exception {
        reporte(LAT_A, LON_A, "Miraflores", EstadoReporte.RECHAZADO);
        reporte(LAT_B, LON_B, "Miraflores", EstadoReporte.RESUELTO);
        reporte(LAT_SURCO, LON_SURCO, "Santiago de Surco", EstadoReporte.CANCELADO);

        mockMvc.perform(get(URL))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReportes", is(2)))
                .andExpect(jsonPath("$.celdas", hasSize(1)))
                .andExpect(jsonPath("$.celdas[0].latitud", is(-12.121)))
                .andExpect(jsonPath("$.celdas[0].cantidad", is(2)));
    }

    @Test
    void filtroFechas_bordesInclusivos() throws Exception {
        Instant base = Instant.parse("2026-09-01T12:00:00Z");
        fijarCreacion(reporte(LAT_A, LON_A, "Miraflores", EstadoReporte.PENDIENTE), base.minus(10, ChronoUnit.DAYS));
        fijarCreacion(reporte(LAT_B, LON_B, "Miraflores", EstadoReporte.PENDIENTE), base);
        fijarCreacion(reporte(LAT_SURCO, LON_SURCO, "Santiago de Surco", EstadoReporte.PENDIENTE),
                base.plus(10, ChronoUnit.DAYS));

        mockMvc.perform(get(URL).param("fechaDesde", base.toString()).param("fechaHasta", base.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReportes", is(1)))
                .andExpect(jsonPath("$.celdas[0].latitud", is(-12.121)));

        mockMvc.perform(get(URL).param("fechaDesde", base.minus(1, ChronoUnit.DAYS).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReportes", is(2)));
    }

    @Test
    void rangoInvertido_oParametroMalTipado_es400() throws Exception {
        mockMvc.perform(get(URL)
                        .param("fechaDesde", "2026-10-02T00:00:00Z")
                        .param("fechaHasta", "2026-10-01T00:00:00Z"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get(URL).param("estado", "ARREGLADO"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void politicaDeCache_publicaUnMinutoConEtag_y304SiNoCambio() throws Exception {
        reporte(LAT_A, LON_A, "Miraflores", EstadoReporte.PENDIENTE);

        MvcResult primera = mockMvc.perform(get(URL))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=60")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().exists("ETag"))
                .andReturn();
        String etag = primera.getResponse().getHeader("ETag");

        // Mismo contenido: 304 sin cuerpo.
        mockMvc.perform(get(URL).header("If-None-Match", etag))
                .andExpect(status().isNotModified())
                .andExpect(content().string(""));

        // Cambian los datos: 200 con otro ETag.
        reporte(LAT_SURCO, LON_SURCO, "Santiago de Surco", EstadoReporte.PENDIENTE);
        MvcResult cambiada = mockMvc.perform(get(URL).header("If-None-Match", etag))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReportes", is(2)))
                .andReturn();
        assertThat(cambiada.getResponse().getHeader("ETag")).isNotEqualTo(etag);

        // Otros filtros, otro contenido, otro ETag.
        MvcResult filtrada = mockMvc.perform(get(URL)
                        .param("distritoId", distrito("Miraflores").getId().toString()))
                .andExpect(status().isOk()).andReturn();
        assertThat(filtrada.getResponse().getHeader("ETag"))
                .isNotEqualTo(cambiada.getResponse().getHeader("ETag"));
    }

    /** La respuesta no depende de quien consulta: con token es la misma. */
    @Test
    void conToken_mismaRespuestaQueAnonimo() throws Exception {
        reporte(LAT_A, LON_A, "Miraflores", EstadoReporte.PENDIENTE);
        Usuario funcionario = usuario(Rol.FUNCIONARIO_MUNICIPAL);
        String token = jwtService.generarToken(funcionario.getEmail(), funcionario.getRol().name());

        String anonimo = mockMvc.perform(get(URL)).andReturn().getResponse().getContentAsString();
        mockMvc.perform(get(URL).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(content().json(anonimo, true));
    }

    /** Solo el GET es publico: la ruta exacta no abre otros metodos. */
    @Test
    void otrosMetodos_noSonPublicos() throws Exception {
        mockMvc.perform(post(URL)).andExpect(status().isUnauthorized());
    }
}
