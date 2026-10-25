package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.AdhesionReporte;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * La sugerencia de categoria (NC-04) es una senal interna: sale de un
 * detector, asi que <b>ningun</b> DTO del reporte la expone, ni al publico, ni
 * al ciudadano, ni al funcionario (mostrarsela es una decision aparte). Solo la
 * vista previa muestra la categoria sugerida, al crear.
 *
 * <p>Como {@code SenalInternaFueraDeDtosPublicosIT}, endpoint por endpoint y
 * <b>sobre el cuerpo entero</b>, no solo sobre un nombre de campo: cada
 * reporte lleva una sugerencia con valores reconocibles (version
 * {@value #VERSION}, categoria «Pista deteriorada» cuando el reporte es
 * «Bache»), y ni esos valores ni ningun nombre de campo de la sugerencia
 * pueden aparecer. Cada caso afirma
 * antes que el reporte esta en la respuesta.</p>
 */
class SugerenciaFueraDeDtosIT extends AbstractPostgisIT {

    private static final String VERSION = "modelo-secreto-v9";
    private static final String CONFIANZA = "0.777";
    /*
     * La confianza no se busca por su valor: tres digitos pueden aparecer en
     * una fecha («…:10.777Z»). La cubre el nombre del campo («onfianza»).
     */
    private static final List<String> PROHIBIDO = List.of(VERSION, "Pista deteriorada",
            "ugerid", "ugerencia", "onfianza", "ersionModelo", "claseModelo");

    @Autowired
    MockMvc mockMvc;
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
    JdbcTemplate jdbcTemplate;

    private Distrito miraflores() {
        return distritoRepository.findByNombre("Miraflores").orElseThrow();
    }

    private CategoriaDano estandar(String nombre) {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals(nombre)).findFirst().orElseThrow();
    }

    private Usuario usuario(Rol rol) {
        return guardarConTerminos(Usuario.builder()
                .email(rol.name().toLowerCase() + "-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(rol)
                .distrito(rol == Rol.FUNCIONARIO_MUNICIPAL ? miraflores() : null)
                .build());
    }

    private String bearer(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    /** Reporte «Bache» de Miraflores con una sugerencia ya escrita (otra categoria, valores reconocibles). */
    private Reporte conSugerencia(EstadoReporte estado, Usuario creador, Instant resolvedAt) {
        Reporte r = reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(estandar("Bache")).creador(creador).distrito(miraflores())
                .estado(estado).totalAdhesiones(1).resolvedAt(resolvedAt).build());
        adhesionRepository.save(AdhesionReporte.builder().reporte(r).usuario(creador).build());
        jdbcTemplate.update("UPDATE reporte SET categoria_sugerida_id = ?, confianza_sugerencia = " + CONFIANZA
                + ", version_modelo_sugerencia = ? WHERE id = ?", estandar("Pista deteriorada").getId(), VERSION,
                r.getId());
        return r;
    }

    /** Ejecuta, exige 2xx, que el reporte este en la respuesta y que no haya rastro de la sugerencia. */
    private void sinRastro(RequestBuilder peticion, Reporte r) throws Exception {
        String cuerpo = mockMvc.perform(peticion)
                .andExpect(status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(cuerpo).contains(r.getId().toString());
        for (String prohibido : PROHIBIDO) {
            assertThat(cuerpo).as("la respuesta no debe contener «%s»", prohibido).doesNotContain(prohibido);
        }
    }

    @Test
    void lasRutasPublicas_noLaExponen() throws Exception {
        Reporte r = conSugerencia(EstadoReporte.EN_PROCESO, usuario(Rol.CIUDADANO), null);

        sinRastro(get("/api/reportes").param("distritoId", String.valueOf(miraflores().getId())), r);
        // El mapa (US-10) va por otra consulta, con el mismo DTO.
        sinRastro(get("/api/reportes").param("minLat", "-12.13").param("minLon", "-77.04")
                .param("maxLat", "-12.11").param("maxLon", "-77.02"), r);
        sinRastro(get("/api/reportes/{id}", r.getId()), r);
    }

    @Test
    void lasRutasDelCiudadano_noLaExponen_niAlCreadorNiAlAdherido() throws Exception {
        Usuario creador = usuario(Rol.CIUDADANO);
        Usuario adherido = usuario(Rol.CIUDADANO);
        Reporte pendiente = conSugerencia(EstadoReporte.PENDIENTE, creador, null);
        adhesionRepository.save(AdhesionReporte.builder().reporte(pendiente).usuario(adherido).build());
        Reporte resuelto = conSugerencia(EstadoReporte.RESUELTO, creador, Instant.now().minus(4, ChronoUnit.DAYS));
        Reporte aCancelar = conSugerencia(EstadoReporte.PENDIENTE, creador, null);

        sinRastro(get("/api/reportes/mis-reportes").header("Authorization", bearer(creador)), pendiente);
        sinRastro(get("/api/reportes/mis-adhesiones").header("Authorization", bearer(adherido)), pendiente);
        sinRastro(get("/api/reportes/mis-reportes/pendientes-calificacion")
                .header("Authorization", bearer(creador)), resuelto);
        sinRastro(patch("/api/reportes/{id}", pendiente.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"descripcion\":\"Ahora es mas profundo\"}")
                .header("Authorization", bearer(creador)), pendiente);
        sinRastro(delete("/api/reportes/{id}", aCancelar.getId()).header("Authorization", bearer(creador)), aCancelar);
    }

    @Test
    void crearOAdherirse_noLaExpone() throws Exception {
        // Junto a un reporte con sugerencia: el POST termina en adhesion (US-09) y devuelve ESE reporte.
        Reporte r = conSugerencia(EstadoReporte.PENDIENTE, usuario(Rol.CIUDADANO), null);
        MockMultipartFile foto = new MockMultipartFile("foto", "bache.png", "image/png", ImagenesDePrueba.png(64, 48));

        sinRastro(multipart("/api/reportes").file(foto)
                .param("latitud", "-12.1215").param("longitud", "-77.0297")
                .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                .param("categoriaId", String.valueOf(estandar("Bache").getId()))
                .header("Authorization", bearer(usuario(Rol.CIUDADANO))), r);
    }

    @Test
    void lasRutasDelFuncionario_tampocoLaExponen() throws Exception {
        Usuario funcionario = usuario(Rol.FUNCIONARIO_MUNICIPAL);
        Usuario creador = usuario(Rol.CIUDADANO);
        Reporte r = conSugerencia(EstadoReporte.PENDIENTE, creador, null);

        sinRastro(get("/api/reportes/bandeja").header("Authorization", bearer(funcionario)), r);
        sinRastro(get("/api/reportes/exportar").param("formato", "CSV")
                .header("Authorization", bearer(funcionario)), r);
        sinRastro(patch("/api/reportes/{id}/estado", r.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"estado\":\"RECIBIDO\"}")
                .header("Authorization", bearer(funcionario)), r);

        // El historial no repite el reporte; basta con que no tenga rastro.
        String historial = mockMvc.perform(get("/api/reportes/{id}/historial", r.getId())
                        .header("Authorization", bearer(creador)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(historial).contains("RECIBIDO");
        PROHIBIDO.forEach(p -> assertThat(historial).doesNotContain(p));
    }
}
