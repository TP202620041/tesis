package pe.edu.upc.viasegura.reportes.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.reportes.domain.Calificacion;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.dto.CalificacionResponse;
import pe.edu.upc.viasegura.reportes.dto.CalificarRequest;
import pe.edu.upc.viasegura.reportes.dto.ReporteResumenResponse;
import pe.edu.upc.viasegura.reportes.event.CalificacionRegistradaEvent;
import pe.edu.upc.viasegura.reportes.repository.CalificacionRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Calificacion ciudadana de la atencion recibida tras la resolucion de un
 * reporte (US-26).
 *
 * <p>La calificacion es insumo directo de la satisfaccion en el indice de
 * desempeno distrital (US-18/20): {@link Calificacion} se une al distrito sin
 * ambiguedad via {@code reporte.distrito}, por lo que la agregacion futura es
 * un JOIN simple (no hace falta un campo distrito propio).</p>
 */
@Service
@RequiredArgsConstructor
public class CalificacionService {

    /** US-26 Esc.2: dias tras la resolucion para recordar la calificacion. */
    private static final int DIAS_RECORDATORIO = 3;

    private final ReporteRepository reporteRepository;
    private final UsuarioRepository usuarioRepository;
    private final CalificacionRepository calificacionRepository;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * US-26: el ciudadano creador califica un reporte resuelto. Solo el
     * creador (asimetria intencional respecto a US-22, donde el adherido si
     * puede VER el historial): calificar la atencion es un juicio autoral del
     * ciudadano que origino el reporte, no de todos los afectados.
     */
    @Transactional
    public CalificacionResponse calificar(String emailCiudadano, Long reporteId, CalificarRequest req) {
        Usuario ciudadano = usuarioRepository.findByEmail(emailCiudadano)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        Reporte reporte = reporteRepository.findById(reporteId)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));

        if (reporte.getCreador() == null || !reporte.getCreador().getId().equals(ciudadano.getId())) {
            throw new AccessDeniedException("Solo el creador del reporte puede calificar la atencion");
        }
        // Precondicion de estado (conflicto con el estado actual del recurso),
        // mismo criterio que las transiciones invalidas de US-14/15 -> 409.
        if (reporte.getEstado() != EstadoReporte.RESUELTO) {
            throw new BusinessException("Solo se puede calificar un reporte resuelto");
        }
        // Una sola vez: el UNIQUE (reporte, usuario) modela una calificacion
        // por ciudadano; un segundo intento es un duplicado -> 409 (mismo
        // idioma que "Ya reportaste este dano" de US-09).
        if (calificacionRepository.existsByReporteIdAndUsuarioId(reporteId, ciudadano.getId())) {
            throw new BusinessException("Ya calificaste la atencion de este reporte");
        }

        Calificacion calificacion = calificacionRepository.save(Calificacion.builder()
                .reporte(reporte)
                .usuario(ciudadano)
                .estrellas(req.estrellas())
                .comentario(req.comentario())
                .build());

        // Recalcula la satisfaccion del indice de desempeno (US-18/20) AFTER_COMMIT.
        eventPublisher.publishEvent(new CalificacionRegistradaEvent(reporte.getId()));

        return CalificacionResponse.from(calificacion);
    }

    /**
     * US-26 Esc.2: reportes del ciudadano resueltos hace mas de 3 dias que
     * aun no califico. Consulta bajo demanda para un aviso no intrusivo.
     */
    @Transactional(readOnly = true)
    public List<ReporteResumenResponse> pendientesDeCalificacion(String emailCiudadano) {
        Usuario ciudadano = usuarioRepository.findByEmail(emailCiudadano)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        Instant limite = Instant.now().minus(DIAS_RECORDATORIO, ChronoUnit.DAYS);
        return reporteRepository.findPendientesDeCalificacion(ciudadano.getId(), limite).stream()
                .map(ReporteResumenResponse::from)
                .toList();
    }
}
