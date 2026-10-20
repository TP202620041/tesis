package pe.edu.upc.viasegura.desempeno;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.desempeno.service.DesempenoService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.AsignacionResponsable;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.repository.AsignacionResponsableRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Dashboard interno del funcionario para su propio distrito (US-17). */
class DashboardDistritoIT extends AbstractPostgisIT {

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
    @Autowired
    AsignacionResponsableRepository asignacionRepository;
    @Autowired
    DesempenoService desempenoService;
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

    private Usuario funcionario(Distrito distritoGestion) {
        return guardarConTerminos(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).distrito(distritoGestion).build());
    }

    private Reporte reporte(Distrito distrito, EstadoReporte estado, Usuario creador) {
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria()).creador(creador).distrito(distrito)
                .estado(estado).totalAdhesiones(1).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    /** Fuerza updated_at directo en BD (el auditing de JPA lo sobreescribe en cada save). */
    private void backdatearActualizacion(Long reporteId, Instant instante) {
        jdbcTemplate.update("UPDATE reporte SET updated_at = ? WHERE id = ?",
                Timestamp.from(instante), reporteId);
    }

    @Test
    void funcionarioVeResumenDeSuPropioDistrito() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        Usuario ciu = ciudadano();
        reporte(miraflores, EstadoReporte.RESUELTO, ciu);
        reporte(miraflores, EstadoReporte.EN_PROCESO, ciu);
        desempenoService.refrescarIndice();

        mockMvc.perform(get("/api/desempeno/mi-distrito")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resumen.distritoNombre", Matchers.is("Miraflores")))
                .andExpect(jsonPath("$.resumen.totalReportes", Matchers.is(2)))
                .andExpect(jsonPath("$.resumen.totalResueltos", Matchers.is(1)));
    }

    @Test
    void cuentaReportesSinResponsableAsignado() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        Usuario ciu = ciudadano();
        Reporte sinResponsable = reporte(miraflores, EstadoReporte.RECIBIDO, ciu);
        Reporte conResponsable = reporte(miraflores, EstadoReporte.EN_PROCESO, ciu);
        asignacionRepository.save(AsignacionResponsable.builder()
                .reporte(conResponsable).responsable("Cuadrilla A").activo(true).build());
        desempenoService.refrescarIndice();

        mockMvc.perform(get("/api/desempeno/mi-distrito")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reportesSinResponsable", Matchers.is(1)));
    }

    @Test
    void cuentaReportesEstancados_masDe7DiasSinCambioDeEstado() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        Usuario ciu = ciudadano();
        Reporte estancado = reporte(miraflores, EstadoReporte.EN_PROCESO, ciu);
        Reporte reciente = reporte(miraflores, EstadoReporte.EN_PROCESO, ciu);
        Reporte resueltoAntiguo = reporte(miraflores, EstadoReporte.RESUELTO, ciu);
        backdatearActualizacion(estancado.getId(), Instant.now().minus(10, ChronoUnit.DAYS));
        backdatearActualizacion(resueltoAntiguo.getId(), Instant.now().minus(10, ChronoUnit.DAYS));
        desempenoService.refrescarIndice();

        mockMvc.perform(get("/api/desempeno/mi-distrito")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                // Solo "estancado" cuenta: "reciente" esta al dia y
                // "resueltoAntiguo" es terminal (no se considera desatendido).
                .andExpect(jsonPath("$.reportesEstancados", Matchers.is(1)));
    }

    @Test
    void funcionarioSinDistritoAsignado_403() throws Exception {
        Usuario func = guardarConTerminos(Usuario.builder()
                .email("func-sindistrito-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("SinDistrito").rol(Rol.FUNCIONARIO_MUNICIPAL).build());

        mockMvc.perform(get("/api/desempeno/mi-distrito")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isForbidden());
    }

    @Test
    void ciudadano_403() throws Exception {
        mockMvc.perform(get("/api/desempeno/mi-distrito")
                        .header("Authorization", "Bearer " + token(ciudadano())))
                .andExpect(status().isForbidden());
    }

    @Test
    void sinToken_401() throws Exception {
        mockMvc.perform(get("/api/desempeno/mi-distrito"))
                .andExpect(status().isUnauthorized());
    }
}
