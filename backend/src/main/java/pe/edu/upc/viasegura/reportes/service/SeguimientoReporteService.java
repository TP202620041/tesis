package pe.edu.upc.viasegura.reportes.service;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.reportes.domain.HistorialEstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.TipoEventoHistorial;
import pe.edu.upc.viasegura.reportes.dto.HistorialEntradaResponse;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.HistorialEstadoReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Seguimiento ciudadano de la linea de tiempo de un reporte (US-22).
 *
 * <p>Devuelve la trazabilidad completa (cambios de estado US-14 +
 * asignaciones US-15) unificada por la migracion V4. El acceso y el nivel de
 * detalle dependen del rol del solicitante (ver {@link #historial}).</p>
 */
@Service
@RequiredArgsConstructor
public class SeguimientoReporteService {

    /** Texto que ve el ciudadano en lugar del nombre interno de la cuadrilla. */
    private static final String ASIGNACION_REDACTADA =
            "Se asignó un responsable para la atención del reporte.";

    private final ReporteRepository reporteRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final AdhesionReporteRepository adhesionRepository;
    private final HistorialEstadoReporteRepository historialRepository;

    /**
     * US-22: linea de tiempo del reporte. Puede verla el ciudadano afectado
     * (creador o adherido), el funcionario del distrito del reporte y el
     * admin; cualquier otro recibe 403. La vista del ciudadano redacta el
     * detalle interno de las asignaciones (nombre de cuadrilla, autor); la
     * del funcionario/admin es completa.
     */
    @Transactional(readOnly = true)
    public List<HistorialEntradaResponse> historial(String emailSolicitante, Long reporteId) {
        Reporte reporte = reporteRepository.findById(reporteId)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));
        Usuario solicitante = usuarioConsultaService.usuarioPorEmail(emailSolicitante);

        boolean vistaDetallada = autorizarYResolverVista(solicitante, reporte);

        return historialRepository.findByReporteIdOrderByCreatedAtAscIdAsc(reporteId).stream()
                .map(entrada -> aResponse(entrada, vistaDetallada))
                .toList();
    }

    /**
     * Verifica el acceso (lanza {@link AccessDeniedException} -> 403 si no lo
     * tiene) y devuelve si la vista debe ser detallada (interna) o redactada.
     */
    private boolean autorizarYResolverVista(Usuario solicitante, Reporte reporte) {
        return switch (solicitante.getRol()) {
            case ADMIN -> true;
            case FUNCIONARIO_MUNICIPAL -> {
                Distrito distrito = solicitante.getDistrito();
                if (distrito == null || reporte.getDistrito() == null
                        || !distrito.getId().equals(reporte.getDistrito().getId())) {
                    throw new AccessDeniedException("No puede ver el historial de reportes de otro distrito");
                }
                yield true;
            }
            case CIUDADANO -> {
                boolean esCreador = reporte.getCreador() != null
                        && reporte.getCreador().getId().equals(solicitante.getId());
                boolean esAdherido = adhesionRepository
                        .existsByReporteIdAndUsuarioId(reporte.getId(), solicitante.getId());
                if (!esCreador && !esAdherido) {
                    throw new AccessDeniedException("No tiene acceso al historial de este reporte");
                }
                yield false;
            }
        };
    }

    private HistorialEntradaResponse aResponse(HistorialEstadoReporte h, boolean vistaDetallada) {
        boolean esAsignacion = h.getTipoEvento() == TipoEventoHistorial.ASIGNACION;
        String comentario = (esAsignacion && !vistaDetallada) ? ASIGNACION_REDACTADA : h.getComentario();
        String autor = (vistaDetallada && h.getAutor() != null)
                ? h.getAutor().getNombre() + " " + h.getAutor().getApellido()
                : null;
        return new HistorialEntradaResponse(
                h.getId(),
                h.getTipoEvento().name(),
                h.getEstadoAnterior() != null ? h.getEstadoAnterior().name() : null,
                h.getEstadoNuevo() != null ? h.getEstadoNuevo().name() : null,
                comentario,
                autor,
                h.getCreatedAt());
    }
}
