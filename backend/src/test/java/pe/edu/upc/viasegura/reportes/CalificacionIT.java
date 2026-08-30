package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import pe.edu.upc.viasegura.reportes.domain.AdhesionReporte;
import pe.edu.upc.viasegura.reportes.domain.Calificacion;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CalificacionRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Calificacion de la atencion recibida (US-26). */
class CalificacionIT extends AbstractPostgisIT {

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
    CalificacionRepository calificacionRepository;

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

    private Reporte reporte(EstadoReporte estado, Usuario creador, Instant resolvedAt) {
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria()).creador(creador).distrito(distrito("Miraflores"))
                .estado(estado).totalAdhesiones(1).resolvedAt(resolvedAt)
                .build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private String cuerpo(int estrellas, String comentario) {
        String c = comentario == null ? "null" : "\"" + comentario + "\"";
        return "{\"estrellas\":%d,\"comentario\":%s}".formatted(estrellas, c);
    }

    @Test
    void creador_calificaReporteResuelto_201() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(EstadoReporte.RESUELTO, creador, Instant.now());

        mockMvc.perform(post("/api/reportes/{id}/calificacion", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(5, "Rapido y bien"))
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.estrellas", is(5)));

        assertThat(calificacionRepository.existsByReporteIdAndUsuarioId(reporte.getId(), creador.getId()))
                .isTrue();
    }

    @Test
    void calificarReporteNoResuelto_409() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(EstadoReporte.EN_PROCESO, creador, null);

        mockMvc.perform(post("/api/reportes/{id}/calificacion", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(4, null))
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isConflict());
    }

    @Test
    void adheridoNoCreador_noPuedeCalificar_403() throws Exception {
        // Asimetria intencional vs US-22: el adherido VE el historial pero NO califica.
        Usuario creador = ciudadano();
        Usuario adherido = ciudadano();
        Reporte reporte = reporte(EstadoReporte.RESUELTO, creador, Instant.now());
        adhesionRepository.save(AdhesionReporte.builder().reporte(reporte).usuario(adherido).build());

        mockMvc.perform(post("/api/reportes/{id}/calificacion", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(5, "buena"))
                        .header("Authorization", "Bearer " + token(adherido)))
                .andExpect(status().isForbidden());

        assertThat(calificacionRepository.existsByReporteIdAndUsuarioId(reporte.getId(), adherido.getId()))
                .isFalse();
    }

    @Test
    void segundaCalificacionDelMismoCiudadano_409() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(EstadoReporte.RESUELTO, creador, Instant.now());
        String auth = "Bearer " + token(creador);

        mockMvc.perform(post("/api/reportes/{id}/calificacion", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo(5, "ok")).header("Authorization", auth))
                .andExpect(status().isCreated());
        // Una sola vez: el segundo intento es un duplicado.
        mockMvc.perform(post("/api/reportes/{id}/calificacion", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo(1, "me arrepenti")).header("Authorization", auth))
                .andExpect(status().isConflict());

        assertThat(calificacionRepository.findAll().stream()
                .filter(c -> c.getReporte().getId().equals(reporte.getId()))).hasSize(1);
    }

    @Test
    void estrellasFueraDeRango_400() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(EstadoReporte.RESUELTO, creador, Instant.now());

        mockMvc.perform(post("/api/reportes/{id}/calificacion", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(6, null))
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void pendientes_soloResueltoHaceMasDe3DiasSinCalificar() throws Exception {
        Usuario creador = ciudadano();
        Usuario otro = ciudadano();
        Instant hace4dias = Instant.now().minus(4, ChronoUnit.DAYS);

        Reporte pendiente = reporte(EstadoReporte.RESUELTO, creador, hace4dias);           // aparece
        reporte(EstadoReporte.RESUELTO, creador, Instant.now());                            // muy reciente -> no
        Reporte yaCalificado = reporte(EstadoReporte.RESUELTO, creador, hace4dias);         // calificado -> no
        calificacionRepository.save(Calificacion.builder()
                .reporte(yaCalificado).usuario(creador).estrellas(4).build());
        reporte(EstadoReporte.EN_PROCESO, creador, null);                                   // no resuelto -> no
        reporte(EstadoReporte.RESUELTO, otro, hace4dias);                                   // de otro -> no

        mockMvc.perform(get("/api/reportes/mis-reportes/pendientes-calificacion")
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id", is(pendiente.getId().intValue())));
    }

    // --- Consultar la calificacion propia ---------------------------------
    // El frontend la usa para decidir entre mostrar el formulario o lo que el
    // ciudadano ya calificó. El 404 ES la señal de "todavía no calificaste",
    // no un error a reportar.

    @Test
    void devuelveLaCalificacionQueElCiudadanoYaDejo() throws Exception {
        Usuario creador = ciudadano();
        Reporte r = reporte(EstadoReporte.RESUELTO, creador, Instant.now());

        mockMvc.perform(post("/api/reportes/{id}/calificacion", r.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(4, "Tardaron pero quedó bien"))
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isCreated());

        // No basta con saber QUE calificó: se le devuelve lo que dijo.
        mockMvc.perform(get("/api/reportes/{id}/calificacion", r.getId())
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estrellas", is(4)))
                .andExpect(jsonPath("$.comentario", is("Tardaron pero quedó bien")))
                .andExpect(jsonPath("$.reporteId", is(r.getId().intValue())));
    }

    @Test
    void sinCalificar_404() throws Exception {
        Usuario creador = ciudadano();
        Reporte r = reporte(EstadoReporte.RESUELTO, creador, Instant.now());

        mockMvc.perform(get("/api/reportes/{id}/calificacion", r.getId())
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isNotFound());
    }

    @Test
    void otroCiudadanoNoVeLaCalificacionAjena_403() throws Exception {
        // Mismo criterio que calificar: solo el creador. Un adherido tampoco,
        // aunque sí pueda ver el historial (US-22).
        Usuario creador = ciudadano();
        Usuario otro = ciudadano();
        Reporte r = reporte(EstadoReporte.RESUELTO, creador, Instant.now());
        calificacionRepository.save(Calificacion.builder()
                .reporte(r).usuario(creador).estrellas(5).build());

        mockMvc.perform(get("/api/reportes/{id}/calificacion", r.getId())
                        .header("Authorization", "Bearer " + token(otro)))
                .andExpect(status().isForbidden());
    }

    @Test
    void sinToken_401() throws Exception {
        Usuario creador = ciudadano();
        Reporte r = reporte(EstadoReporte.RESUELTO, creador, Instant.now());

        mockMvc.perform(get("/api/reportes/{id}/calificacion", r.getId()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reporteInexistente_404() throws Exception {
        mockMvc.perform(get("/api/reportes/{id}/calificacion", 999_999)
                        .header("Authorization", "Bearer " + token(ciudadano())))
                .andExpect(status().isNotFound());
    }
}
