package pe.edu.upc.viasegura.reportes;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.AdhesionReporte;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.HistorialEstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.TipoEventoHistorial;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.HistorialEstadoReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Seguimiento ciudadano del historial de un reporte (US-22). */
class HistorialReporteIT extends AbstractPostgisIT {

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
    AdhesionReporteRepository adhesionRepository;
    @Autowired
    HistorialEstadoReporteRepository historialRepository;

    private Reporte reporte;
    private Usuario creador;
    private Usuario adherido;
    private Usuario ajeno;
    private Usuario funcMiraflores;
    private Usuario funcSurco;

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
    }

    private Usuario ciudadano() {
        return usuarioRepository.save(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO)
                .build());
    }

    private Usuario funcionario(Distrito distritoGestion) {
        return usuarioRepository.save(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).distrito(distritoGestion)
                .build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    @BeforeEach
    void montarEscenario() {
        creador = ciudadano();
        adherido = ciudadano();
        ajeno = ciudadano();
        funcMiraflores = funcionario(distrito("Miraflores"));
        funcSurco = funcionario(distrito("Santiago de Surco"));

        reporte = reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria()).creador(creador).distrito(distrito("Miraflores"))
                .estado(EstadoReporte.EN_PROCESO).totalAdhesiones(2)
                .build());

        adhesionRepository.save(AdhesionReporte.builder().reporte(reporte).usuario(creador).build());
        adhesionRepository.save(AdhesionReporte.builder().reporte(reporte).usuario(adherido).build());

        // Linea de tiempo: 2 cambios de estado + 1 asignacion (con dato interno).
        historialRepository.save(HistorialEstadoReporte.builder()
                .reporte(reporte).tipoEvento(TipoEventoHistorial.CAMBIO_ESTADO)
                .estadoAnterior(EstadoReporte.PENDIENTE).estadoNuevo(EstadoReporte.RECIBIDO)
                .comentario("Reporte recibido").autor(funcMiraflores).build());
        historialRepository.save(HistorialEstadoReporte.builder()
                .reporte(reporte).tipoEvento(TipoEventoHistorial.CAMBIO_ESTADO)
                .estadoAnterior(EstadoReporte.RECIBIDO).estadoNuevo(EstadoReporte.EN_PROCESO)
                .comentario("Cuadrilla en camino").autor(funcMiraflores).build());
        historialRepository.save(HistorialEstadoReporte.builder()
                .reporte(reporte).tipoEvento(TipoEventoHistorial.ASIGNACION)
                .comentario("Responsable asignado: Cuadrilla Norte").autor(funcMiraflores).build());
    }

    @Test
    void creador_veTimelineOrdenada_conAsignacionRedactada() throws Exception {
        mockMvc.perform(get("/api/reportes/{id}/historial", reporte.getId())
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].tipoEvento", is("CAMBIO_ESTADO")))
                .andExpect(jsonPath("$[0].estadoNuevo", is("RECIBIDO")))
                .andExpect(jsonPath("$[1].estadoNuevo", is("EN_PROCESO")))
                .andExpect(jsonPath("$[2].tipoEvento", is("ASIGNACION")))
                .andExpect(jsonPath("$[2].estadoNuevo", is(nullValue())))
                // Asignacion redactada: sin nombre de cuadrilla ni autor.
                .andExpect(jsonPath("$[2].comentario", is("Se asigno un responsable para la atencion del reporte.")))
                .andExpect(jsonPath("$[2].autor", is(nullValue())));
    }

    @Test
    void adherido_veTimeline() throws Exception {
        mockMvc.perform(get("/api/reportes/{id}/historial", reporte.getId())
                        .header("Authorization", "Bearer " + token(adherido)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)));
    }

    @Test
    void ciudadanoNiCreadorNiAdherido_403() throws Exception {
        mockMvc.perform(get("/api/reportes/{id}/historial", reporte.getId())
                        .header("Authorization", "Bearer " + token(ajeno)))
                .andExpect(status().isForbidden());
    }

    @Test
    void funcionarioDelDistrito_veDetalleCompletoSinRedactar() throws Exception {
        mockMvc.perform(get("/api/reportes/{id}/historial", reporte.getId())
                        .header("Authorization", "Bearer " + token(funcMiraflores)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                // El funcionario si ve el nombre interno de la cuadrilla y el autor.
                .andExpect(jsonPath("$[2].comentario", containsString("Cuadrilla Norte")))
                .andExpect(jsonPath("$[2].autor", is(notNullValue())));
    }

    @Test
    void funcionarioDeOtroDistrito_403() throws Exception {
        mockMvc.perform(get("/api/reportes/{id}/historial", reporte.getId())
                        .header("Authorization", "Bearer " + token(funcSurco)))
                .andExpect(status().isForbidden());
    }

    @Test
    void sinToken_401() throws Exception {
        mockMvc.perform(get("/api/reportes/{id}/historial", reporte.getId()))
                .andExpect(status().isUnauthorized());
    }
}
