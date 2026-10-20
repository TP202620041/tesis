package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;
import pe.edu.upc.viasegura.notificaciones.domain.EstadoEntrega;
import pe.edu.upc.viasegura.notificaciones.domain.Notificacion;
import pe.edu.upc.viasegura.notificaciones.repository.NotificacionRepository;
import pe.edu.upc.viasegura.reportes.domain.AsignacionResponsable;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.HistorialEstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.TipoEventoHistorial;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.AsignacionResponsableRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.HistorialEstadoReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisMailIT;

/** Tests de bandeja municipal y cambio de estado (US-13, US-14). */
class GestionMunicipalIT extends AbstractPostgisMailIT {

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
    HistorialEstadoReporteRepository historialRepository;
    @Autowired
    AdhesionReporteRepository adhesionRepository;
    @Autowired
    NotificacionRepository notificacionRepository;
    @Autowired
    AsignacionResponsableRepository asignacionRepository;

    @BeforeEach
    void limpiar() {
        historialRepository.deleteAll();
        adhesionRepository.deleteAll();
        reporteRepository.deleteAll();
    }

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst()
                .orElseThrow();
    }

    private Usuario funcionario(Distrito distritoGestion) {
        return guardarConTerminos(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL)
                .distrito(distritoGestion)
                .build());
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina")
                .rol(Rol.CIUDADANO)
                .build());
    }

    private Reporte reporte(Distrito distrito, EstadoReporte estado, Usuario creador) {
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria())
                .creador(creador)
                .distrito(distrito)
                .estado(estado)
                .totalAdhesiones(1)
                .build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private String cuerpo(EstadoReporte estado, String comentario) {
        String coment = comentario == null ? "null" : "\"" + comentario + "\"";
        return "{\"estado\":\"%s\",\"comentario\":%s}".formatted(estado, coment);
    }

    @Test
    void funcionarioDeOtroDistrito_noPuedeCambiarEstado_403() throws Exception {
        Usuario funcMiraflores = funcionario(distrito("Miraflores"));
        Reporte reporteSurco = reporte(distrito("Santiago de Surco"), EstadoReporte.RECIBIDO, ciudadano());

        mockMvc.perform(patch("/api/reportes/{id}/estado", reporteSurco.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(EstadoReporte.EN_PROCESO, "en camino"))
                        .header("Authorization", "Bearer " + token(funcMiraflores)))
                .andExpect(status().isForbidden());

        // El estado no cambio.
        assertThat(reporteRepository.findById(reporteSurco.getId()).orElseThrow().getEstado())
                .isEqualTo(EstadoReporte.RECIBIDO);
    }

    @Test
    void transicionInvalida_resueltoARecibido_409() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RESUELTO, ciudadano());

        mockMvc.perform(patch("/api/reportes/{id}/estado", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(EstadoReporte.RECIBIDO, "reabrir"))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isConflict());
    }

    @Test
    void rechazoSinComentario_400() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano());

        mockMvc.perform(patch("/api/reportes/{id}/estado", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(EstadoReporte.RECHAZADO, null))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cambioValido_registraHistorialConAutorYEstados() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Usuario ciudadano = ciudadano();
        // D-12: el aviso por correo exige el consentimiento NOTIFICACIONES_CORREO.
        otorgar(ciudadano, FinalidadConsentimiento.NOTIFICACIONES_CORREO);
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano);

        mockMvc.perform(patch("/api/reportes/{id}/estado", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(EstadoReporte.EN_PROCESO, "Cuadrilla asignada"))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado", is("EN_PROCESO")));

        List<HistorialEstadoReporte> historial =
                historialRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(historial).hasSize(1);
        HistorialEstadoReporte h = historial.get(0);
        assertThat(h.getEstadoAnterior()).isEqualTo(EstadoReporte.RECIBIDO);
        assertThat(h.getEstadoNuevo()).isEqualTo(EstadoReporte.EN_PROCESO);
        assertThat(h.getComentario()).isEqualTo("Cuadrilla asignada");
        assertThat(h.getAutor().getId()).isEqualTo(func.getId());

        // El cambio dispara la notificacion al ciudadano (US-16): con GreenMail
        // arriba el email se entrega de verdad (ENVIADA), no queda en FALLIDA.
        List<Notificacion> notifs = notificacionRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(notifs).anyMatch(n ->
                n.getCanal() == CanalNotificacion.EMAIL && n.getEstadoEntrega() == EstadoEntrega.ENVIADA);
    }

    @Test
    void transicionAResuelto_sellaResolvedAt() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.EN_PROCESO, ciudadano());

        mockMvc.perform(patch("/api/reportes/{id}/estado", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(EstadoReporte.RESUELTO, "Bache tapado"))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado", is("RESUELTO")));

        // El sellado de resolved_at habilita las metricas de desempeno (US-18/20).
        Reporte persistido = reporteRepository.findById(reporte.getId()).orElseThrow();
        assertThat(persistido.getEstado()).isEqualTo(EstadoReporte.RESUELTO);
        assertThat(persistido.getResolvedAt()).isNotNull();
    }

    @Test
    void rechazoConComentario_registraHistorialYNoSellaResolvedAt() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano());

        mockMvc.perform(patch("/api/reportes/{id}/estado", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(EstadoReporte.RECHAZADO, "Via metropolitana, fuera de mi jurisdiccion"))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado", is("RECHAZADO")));

        Reporte persistido = reporteRepository.findById(reporte.getId()).orElseThrow();
        assertThat(persistido.getResolvedAt()).isNull();

        List<HistorialEstadoReporte> historial =
                historialRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId());
        assertThat(historial).hasSize(1);
        HistorialEstadoReporte h = historial.get(0);
        assertThat(h.getEstadoNuevo()).isEqualTo(EstadoReporte.RECHAZADO);
        assertThat(h.getComentario()).isEqualTo("Via metropolitana, fuera de mi jurisdiccion");
    }

    @Test
    void bandeja_soloMuestraReportesDelPropioDistrito() throws Exception {
        Usuario funcMiraflores = funcionario(distrito("Miraflores"));
        reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano());
        reporte(distrito("Santiago de Surco"), EstadoReporte.RECIBIDO, ciudadano());

        mockMvc.perform(get("/api/reportes/bandeja")
                        .header("Authorization", "Bearer " + token(funcMiraflores)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].distritoNombre", is("Miraflores")));
    }

    @Test
    void bandeja_ciudadanoNoAutorizado_403() throws Exception {
        mockMvc.perform(get("/api/reportes/bandeja")
                        .header("Authorization", "Bearer " + token(ciudadano())))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------
    // US-15: asignacion de responsable interno.
    // ------------------------------------------------------------------

    private String cuerpoResponsable(String responsable, String notas) {
        String n = notas == null ? "null" : "\"" + notas + "\"";
        return "{\"responsable\":\"%s\",\"notas\":%s}".formatted(responsable, n);
    }

    @Test
    void asignarResponsable_funcionarioDeOtroDistrito_403() throws Exception {
        Usuario funcMiraflores = funcionario(distrito("Miraflores"));
        Reporte reporteSurco = reporte(distrito("Santiago de Surco"), EstadoReporte.RECIBIDO, ciudadano());

        mockMvc.perform(post("/api/reportes/{id}/responsable", reporteSurco.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoResponsable("Cuadrilla Norte", "urgente"))
                        .header("Authorization", "Bearer " + token(funcMiraflores)))
                .andExpect(status().isForbidden());

        assertThat(asignacionRepository.findByReporteIdAndActivoTrue(reporteSurco.getId())).isEmpty();
    }

    @Test
    void asignarResponsable_valido_persisteYEsConsultablePorGet() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.EN_PROCESO, ciudadano());

        mockMvc.perform(post("/api/reportes/{id}/responsable", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoResponsable("Cuadrilla Bacheo 3", "tapar bache av. principal"))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.responsable", is("Cuadrilla Bacheo 3")))
                .andExpect(jsonPath("$.activo", is(true)));

        // Consultable desde el detalle del reporte.
        mockMvc.perform(get("/api/reportes/{id}/responsable", reporte.getId())
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.responsable", is("Cuadrilla Bacheo 3")))
                .andExpect(jsonPath("$.notas", is("tapar bache av. principal")));

        // La asignacion dejo su traza ASIGNACION en la linea de tiempo unica,
        // sin estados (no es una transicion).
        List<HistorialEstadoReporte> traza = historialRepository
                .findByReporteIdOrderByCreatedAtAsc(reporte.getId()).stream()
                .filter(h -> h.getTipoEvento() == TipoEventoHistorial.ASIGNACION).toList();
        assertThat(traza).hasSize(1);
        assertThat(traza.get(0).getEstadoAnterior()).isNull();
        assertThat(traza.get(0).getEstadoNuevo()).isNull();
        assertThat(traza.get(0).getComentario()).contains("Cuadrilla Bacheo 3");
        assertThat(traza.get(0).getAutor().getId()).isEqualTo(func.getId());
    }

    @Test
    void reasignarResponsable_desactivaAnteriorYConservaHistorial() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RECIBIDO, ciudadano());
        String auth = "Bearer " + token(func);

        mockMvc.perform(post("/api/reportes/{id}/responsable", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoResponsable("Cuadrilla A", null)).header("Authorization", auth))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/reportes/{id}/responsable", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoResponsable("Cuadrilla B", null)).header("Authorization", auth))
                .andExpect(status().isCreated());

        // Solo una vigente (la ultima); la anterior queda desactivada, no borrada.
        List<AsignacionResponsable> todas = asignacionRepository
                .findByReporteIdOrderByCreatedAtDesc(reporte.getId());
        assertThat(todas).hasSize(2);
        assertThat(todas.stream().filter(AsignacionResponsable::isActivo)).hasSize(1);
        assertThat(asignacionRepository.findByReporteIdAndActivoTrue(reporte.getId()).orElseThrow()
                .getResponsable()).isEqualTo("Cuadrilla B");

        // El GET devuelve la vigente.
        mockMvc.perform(get("/api/reportes/{id}/responsable", reporte.getId()).header("Authorization", auth))
                .andExpect(jsonPath("$.responsable", is("Cuadrilla B")));

        // Ambas asignaciones dejaron traza (asignacion + reasignacion).
        long trazas = historialRepository.findByReporteIdOrderByCreatedAtAsc(reporte.getId()).stream()
                .filter(h -> h.getTipoEvento() == TipoEventoHistorial.ASIGNACION).count();
        assertThat(trazas).isEqualTo(2);
    }

    @Test
    void asignarResponsable_enEstadoNoAsignable_409() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        // PENDIENTE (aun no tomado por la muni) y RESUELTO (terminal) no admiten asignacion.
        Reporte pendiente = reporte(distrito("Miraflores"), EstadoReporte.PENDIENTE, ciudadano());
        Reporte resuelto = reporte(distrito("Miraflores"), EstadoReporte.RESUELTO, ciudadano());
        String auth = "Bearer " + token(func);

        mockMvc.perform(post("/api/reportes/{id}/responsable", pendiente.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoResponsable("Cuadrilla X", null)).header("Authorization", auth))
                .andExpect(status().isConflict());
        mockMvc.perform(post("/api/reportes/{id}/responsable", resuelto.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpoResponsable("Cuadrilla X", null)).header("Authorization", auth))
                .andExpect(status().isConflict());

        assertThat(asignacionRepository.findByReporteIdAndActivoTrue(pendiente.getId())).isEmpty();
        assertThat(asignacionRepository.findByReporteIdAndActivoTrue(resuelto.getId())).isEmpty();
    }
}
