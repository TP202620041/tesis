package pe.edu.upc.viasegura.reportes;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.common.port.SaneadorDeImagen;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.AdhesionReporte;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.DenunciaReporte;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.MotivoDenuncia;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.DenunciaReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;
import pe.edu.upc.viasegura.support.ImagenesDePrueba;

/**
 * Escenario comun de los IT de ocultar y denunciar (NC-11a): usuarios por rol,
 * reportes en Miraflores con o sin foto y las llamadas a las rutas del ADMIN.
 * No agrega configuracion: usa el mismo contexto de Spring que el resto de IT.
 */
abstract class AbstractModeracionIT extends AbstractPostgisIT {

    /** Parque Kennedy, Miraflores. */
    static final double LAT = -12.1215;
    static final double LON = -77.0297;

    static final String MOTIVO = "La foto muestra la placa de un vehículo particular";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    JdbcTemplate jdbcTemplate;
    @Autowired
    DistritoRepository distritoRepository;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    AdhesionReporteRepository adhesionRepository;
    @Autowired
    DenunciaReporteRepository denunciaRepository;
    @Autowired
    SaneadorDeImagen saneador;
    @Autowired
    FotoStorageService fotoStorageService;

    Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    Distrito miraflores() {
        return distrito("Miraflores");
    }

    CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
    }

    Usuario usuario(Rol rol, Distrito distrito) {
        return guardarConTerminos(Usuario.builder()
                .email(rol.name().toLowerCase() + "-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Nombre").apellido(rol.name().toLowerCase())
                .rol(rol).distrito(distrito)
                .build());
    }

    Usuario ciudadano() {
        return usuario(Rol.CIUDADANO, null);
    }

    Usuario funcionario(Distrito distrito) {
        return usuario(Rol.FUNCIONARIO_MUNICIPAL, distrito);
    }

    Usuario admin() {
        return usuario(Rol.ADMIN, null);
    }

    String bearer(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    /** Guarda la foto como lo haria la creacion (saneada) y devuelve su URL publica. */
    String fotoGuardada() {
        return fotoStorageService.almacenarFotoReporteSaneada(
                saneador.sanear(new ArchivoSubido(ImagenesDePrueba.png(32, 24), "image/png", "bache.png")));
    }

    /** Un reporte de Miraflores con su creador como primer afectado (como la creacion real). */
    Reporte reporte(Usuario creador, EstadoReporte estado, String fotoUrl) {
        Reporte r = reporteRepository.save(Reporte.builder()
                .titulo("Bache en la avenida").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(LON, LAT))
                .fotoUrl(fotoUrl)
                .categoria(categoria()).creador(creador).distrito(miraflores())
                .estado(estado).totalAdhesiones(1)
                .build());
        adhesionRepository.save(AdhesionReporte.builder().reporte(r).usuario(creador).build());
        return r;
    }

    void adherir(Reporte r, Usuario u) {
        adhesionRepository.save(AdhesionReporte.builder().reporte(r).usuario(u).build());
    }

    DenunciaReporte denuncia(Reporte r, Usuario denunciante, MotivoDenuncia motivo) {
        return denunciaRepository.save(DenunciaReporte.builder()
                .reporte(r).denunciante(denunciante).motivo(motivo).build());
    }

    ResultActions moderar(Usuario quien, Long reporteId, String accion, String alcance, String motivo)
            throws Exception {
        return mockMvc.perform(post("/api/admin/moderacion/reportes/{id}/" + accion, reporteId)
                .header("Authorization", bearer(quien))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("alcance", alcance, "motivo", motivo))));
    }

    ResultActions ocultar(Usuario admin, Long reporteId, String alcance) throws Exception {
        return moderar(admin, reporteId, "ocultamiento", alcance, MOTIVO);
    }

    ResultActions restablecer(Usuario admin, Long reporteId, String alcance) throws Exception {
        return moderar(admin, reporteId, "restablecimiento", alcance, "Revisado: el contenido cumple las reglas");
    }
}
