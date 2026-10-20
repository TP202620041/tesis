package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.HistorialEstadoReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Edicion y cancelacion de un reporte propio en estado PENDIENTE (US-08). */
class EditarCancelarReporteIT extends AbstractPostgisIT {

    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

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

    private Distrito distrito() {
        return distritoRepository.findByNombre("Miraflores")
                .orElseThrow(() -> new IllegalStateException("Falta distrito Miraflores"));
    }

    private CategoriaDano categoriaEstandar() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private Reporte reporte(Usuario creador, EstadoReporte estado) {
        return reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(LON, LAT))
                .categoria(categoriaEstandar()).creador(creador).distrito(distrito())
                .estado(estado).totalAdhesiones(1).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    @Test
    void creadorEditaDescripcionDeReportePendiente_200() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.PENDIENTE);

        mockMvc.perform(patch("/api/reportes/{id}", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"descripcion\":\"Bache mas profundo de lo que parecia\"}")
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.descripcion", is("Bache mas profundo de lo que parecia")))
                .andExpect(jsonPath("$.estado", is("PENDIENTE")));
    }

    @Test
    void editarReporteYaRecibido_409() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.RECIBIDO);

        mockMvc.perform(patch("/api/reportes/{id}", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"descripcion\":\"Ya no deberia poder editar\"}")
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isConflict());
    }

    @Test
    void editarReporteAjeno_403() throws Exception {
        Usuario creador = ciudadano();
        Usuario otro = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.PENDIENTE);

        mockMvc.perform(patch("/api/reportes/{id}", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"descripcion\":\"Intento ajeno\"}")
                        .header("Authorization", "Bearer " + token(otro)))
                .andExpect(status().isForbidden());
    }

    @Test
    void creadorCancelaReportePendiente_200_yQuedaEnHistorial() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.PENDIENTE);

        mockMvc.perform(delete("/api/reportes/{id}", reporte.getId())
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado", is("CANCELADO")));

        var historial = historialRepository.findByReporteIdOrderByCreatedAtAscIdAsc(reporte.getId());
        assertThat(historial).hasSize(1);
        assertThat(historial.get(0).getEstadoNuevo()).isEqualTo(EstadoReporte.CANCELADO);
    }

    @Test
    void cancelarReporteYaRecibido_409() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.RECIBIDO);

        mockMvc.perform(delete("/api/reportes/{id}", reporte.getId())
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isConflict());
    }

    @Test
    void cancelarReporteAjeno_403() throws Exception {
        Usuario creador = ciudadano();
        Usuario otro = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.PENDIENTE);

        mockMvc.perform(delete("/api/reportes/{id}", reporte.getId())
                        .header("Authorization", "Bearer " + token(otro)))
                .andExpect(status().isForbidden());
    }

    @Test
    void cancelarReporteConAdheridos_cancelaParaTodos() throws Exception {
        // Decision explicita: un solo dano fisico -> cancelar cierra el
        // reporte completo, no solo la relacion del creador.
        Usuario creador = ciudadano();
        Usuario adherido = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.PENDIENTE);
        adhesionRepository.save(AdhesionReporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA).reporte(reporte).usuario(adherido).build());

        mockMvc.perform(delete("/api/reportes/{id}", reporte.getId())
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado", is("CANCELADO")));

        Reporte recargado = reporteRepository.findById(reporte.getId()).orElseThrow();
        assertThat(recargado.getEstado()).isEqualTo(EstadoReporte.CANCELADO);
    }

    @Test
    void reporteCancelado_noSeConsideraActivoParaAcumulacionDeDuplicados() {
        // Caso limite (US-09): un reporte CANCELADO no debe atraer nuevas
        // adhesiones -- un ciudadano que reporte el mismo punto despues debe
        // abrir un reporte propio, no adherirse a uno retirado.
        Usuario creador = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.CANCELADO);

        var cercano = reporteRepository.findReporteActivoCercano(
                LON, LAT, categoriaEstandar().getId(), 20.0);

        assertThat(cercano).isEmpty();
    }
}
