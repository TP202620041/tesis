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

    /** Texto que ve el adherido en lugar del motivo de ocultar (NC-11a). */
    static final String MODERACION_OCULTA_REDACTADA =
            "Se ocultó contenido de este reporte por las reglas de uso.";

    /** Texto que ve el adherido en lugar del motivo de restablecer (NC-11a). */
    static final String MODERACION_RESTABLECIDA_REDACTADA =
            "Se restableció contenido de este reporte.";

    /** Autor visible de la moderacion para todos menos el ADMIN (NC-11a). */
    static final String AUTOR_MODERACION = "Moderación de Ciudad Viva";

    /**
     * Quien pide el historial, segun su rol y su relacion con el reporte.
     * Decide el acceso, si la vista es interna y que ve de la moderacion.
     */
    private enum Vista {
        ADMIN, FUNCIONARIO, CREADOR, ADHERIDO;

        /** Vista interna: asignaciones sin redactar y autor de la gestion. */
        boolean detallada() {
            return this == ADMIN || this == FUNCIONARIO;
        }

        /** Con el reporte oculto, solo lo ven su creador y el ADMIN (NC-11a). */
        boolean veReporteOculto() {
            return this == ADMIN || this == CREADOR;
        }
    }

    /**
     * US-22: linea de tiempo del reporte. Puede verla el ciudadano afectado
     * (creador o adherido), el funcionario del distrito del reporte y el
     * admin; cualquier otro recibe 403. La vista del ciudadano redacta el
     * detalle interno de las asignaciones (nombre de cuadrilla, autor); la
     * del funcionario/admin es completa.
     *
     * <p><b>Moderacion (NC-11a).</b> Mientras el reporte este oculto, solo lo
     * ven su creador y el ADMIN: el funcionario del distrito y los adheridos
     * reciben 404, como si no existiera (los demas, el 403 de siempre). En las
     * entradas de moderacion, el motivo lo ven el creador, el funcionario y el
     * ADMIN; el adherido ve un texto fijo, y el autor real solo el ADMIN. Ver
     * {@link #aResponse}.</p>
     */
    @Transactional(readOnly = true)
    public List<HistorialEntradaResponse> historial(String emailSolicitante, Long reporteId) {
        Reporte reporte = reporteRepository.findById(reporteId)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));
        Usuario solicitante = usuarioConsultaService.usuarioPorEmail(emailSolicitante);

        Vista vista = autorizarYResolverVista(solicitante, reporte);
        if (reporte.isOculto() && !vista.veReporteOculto()) {
            throw new ResourceNotFoundException("Reporte no encontrado: " + reporteId);
        }

        return historialRepository.findByReporteIdOrderByCreatedAtAscIdAsc(reporteId).stream()
                .map(entrada -> aResponse(entrada, vista))
                .toList();
    }

    /**
     * Verifica el acceso (lanza {@link AccessDeniedException} -> 403 si no lo
     * tiene) y devuelve la vista que corresponde a quien pide.
     */
    private Vista autorizarYResolverVista(Usuario solicitante, Reporte reporte) {
        return switch (solicitante.getRol()) {
            case ADMIN -> Vista.ADMIN;
            case FUNCIONARIO_MUNICIPAL -> {
                Distrito distrito = solicitante.getDistrito();
                if (distrito == null || reporte.getDistrito() == null
                        || !distrito.getId().equals(reporte.getDistrito().getId())) {
                    throw new AccessDeniedException("No puede ver el historial de reportes de otro distrito");
                }
                yield Vista.FUNCIONARIO;
            }
            case CIUDADANO -> {
                boolean esCreador = reporte.getCreador() != null
                        && reporte.getCreador().getId().equals(solicitante.getId());
                if (esCreador) {
                    yield Vista.CREADOR;
                }
                if (!adhesionRepository.existsByReporteIdAndUsuarioId(reporte.getId(), solicitante.getId())) {
                    throw new AccessDeniedException("No tiene acceso al historial de este reporte");
                }
                yield Vista.ADHERIDO;
            }
        };
    }

    private HistorialEntradaResponse aResponse(HistorialEstadoReporte h, Vista vista) {
        TipoEventoHistorial tipo = h.getTipoEvento();
        String comentario;
        String autor;
        if (tipo.esModeracion()) {
            // NC-11a: el motivo es del ADMIN; el adherido solo ve que hubo
            // moderacion. El autor real solo lo ve el ADMIN.
            comentario = vista == Vista.ADHERIDO
                    ? (tipo.oculta() ? MODERACION_OCULTA_REDACTADA : MODERACION_RESTABLECIDA_REDACTADA)
                    : h.getComentario();
            autor = vista == Vista.ADMIN ? nombreDe(h.getAutor()) : AUTOR_MODERACION;
        } else {
            boolean esAsignacion = tipo == TipoEventoHistorial.ASIGNACION;
            comentario = (esAsignacion && !vista.detallada()) ? ASIGNACION_REDACTADA : h.getComentario();
            autor = vista.detallada() ? nombreDe(h.getAutor()) : null;
        }
        return new HistorialEntradaResponse(
                h.getId(),
                tipo.name(),
                h.getEstadoAnterior() != null ? h.getEstadoAnterior().name() : null,
                h.getEstadoNuevo() != null ? h.getEstadoNuevo().name() : null,
                comentario,
                autor,
                h.getCreatedAt(),
                tipo.avisoIndice());
    }

    private static String nombreDe(Usuario autor) {
        return autor != null ? autor.getNombre() + " " + autor.getApellido() : null;
    }
}
