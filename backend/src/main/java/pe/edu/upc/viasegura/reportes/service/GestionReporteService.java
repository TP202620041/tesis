package pe.edu.upc.viasegura.reportes.service;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.OperacionNoPermitidaException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.reportes.domain.AsignacionResponsable;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.HistorialEstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.TipoEventoHistorial;
import pe.edu.upc.viasegura.reportes.dto.AsignacionResponsableResponse;
import pe.edu.upc.viasegura.reportes.dto.AsignarResponsableRequest;
import pe.edu.upc.viasegura.reportes.dto.CambiarEstadoRequest;
import pe.edu.upc.viasegura.reportes.dto.ReporteGestionResponse;
import pe.edu.upc.viasegura.reportes.event.ReporteEstadoCambiadoEvent;
import pe.edu.upc.viasegura.reportes.repository.AsignacionResponsableRepository;
import pe.edu.upc.viasegura.reportes.repository.HistorialEstadoReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Casos de uso de gestion municipal: bandeja de reportes del distrito
 * (US-13) y cambio de estado con trazabilidad (US-14).
 *
 * <p>Separado de {@link ReporteService} (reporte ciudadano) para no mezclar
 * el flujo de reporte con el de gestion.</p>
 */
@Service
@RequiredArgsConstructor
public class GestionReporteService {

    /** Estados en los que tiene sentido asignar un responsable (US-15). */
    private static final Set<EstadoReporte> ESTADOS_ASIGNABLES =
            EnumSet.of(EstadoReporte.RECIBIDO, EstadoReporte.EN_PROCESO);

    private final ReporteRepository reporteRepository;
    private final HistorialEstadoReporteRepository historialRepository;
    private final AsignacionResponsableRepository asignacionRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final ApplicationEventPublisher eventPublisher;

    /** US-13: reportes del distrito del funcionario, con filtros opcionales. */
    @Transactional(readOnly = true)
    public List<ReporteGestionResponse> bandeja(String emailFuncionario, EstadoReporte estado, Long categoriaId) {
        Distrito distrito = distritoDeGestion(emailFuncionario);
        return reporteRepository.findBandeja(distrito.getId(), estado, categoriaId).stream()
                .map(ReporteGestionResponse::from)
                .toList();
    }

    /** US-14: cambia el estado de un reporte con validaciones y auditoria. */
    @Transactional
    public ReporteGestionResponse cambiarEstado(String emailFuncionario, Long reporteId, CambiarEstadoRequest req) {
        Usuario funcionario = usuarioConsultaService.usuarioPorEmail(emailFuncionario);
        Reporte reporte = reporteRepository.findById(reporteId)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));

        verificarJurisdiccion(funcionario, reporte);

        EstadoReporte anterior = reporte.getEstado();
        EstadoReporte nuevo = req.estado();

        // CANCELADO es potestad EXCLUSIVA del ciudadano creador (US-08, via
        // DELETE /api/reportes/{id}): es su retiro voluntario, no una
        // decision municipal. Se rechaza aqui de forma explicita, ademas de
        // no estar en transicionesDeGestionMunicipal(), a proposito:
        //  - da un 403 con un mensaje que dice QUE hacer (rechazar), en vez
        //    del 409 generico de "transicion invalida", que seria enganoso
        //    porque la transicion SI es valida... para el otro actor;
        //  - es defensa en profundidad: si alguien reintrodujera CANCELADO
        //    en el conjunto de gestion, esta guarda seguiria bloqueandolo.
        // Sin esto, un funcionario podia retirar reportes de su distrito y
        // sacarlos de las metricas publicas (excluidos de total_reportes
        // desde V7) sin el escrutinio que exige un RECHAZADO.
        if (nuevo == EstadoReporte.CANCELADO) {
            throw new OperacionNoPermitidaException(
                    "Solo el ciudadano que creo el reporte puede cancelarlo. "
                            + "Para descartarlo, usa RECHAZADO indicando el motivo.");
        }

        if (!anterior.gestionMunicipalPuedeTransicionarA(nuevo)) {
            throw new BusinessException(
                    "Transicion de estado invalida: %s -> %s".formatted(anterior, nuevo));
        }
        if (nuevo == EstadoReporte.RECHAZADO && !StringUtils.hasText(req.comentario())) {
            throw new IllegalArgumentException("El rechazo requiere un comentario que lo justifique");
        }

        reporte.setEstado(nuevo);
        if (nuevo == EstadoReporte.RESUELTO) {
            reporte.setResolvedAt(Instant.now());
        }

        historialRepository.save(HistorialEstadoReporte.builder()
                .reporte(reporte)
                .tipoEvento(TipoEventoHistorial.CAMBIO_ESTADO)
                .estadoAnterior(anterior)
                .estadoNuevo(nuevo)
                .comentario(req.comentario())
                .autor(funcionario)
                .build());

        Reporte guardado = reporteRepository.save(reporte);

        // Punto de extension para notificaciones (US-16/US-21): lo consume
        // ReporteEstadoCambiadoListener AFTER_COMMIT. Se lleva el distrito
        // (no null: verificarJurisdiccion lo garantiza) para que el listener
        // componga el mensaje sin recargar el reporte.
        Distrito distrito = guardado.getDistrito();
        eventPublisher.publishEvent(new ReporteEstadoCambiadoEvent(
                guardado.getId(),
                guardado.getCreador().getId(),
                distrito != null ? distrito.getId() : null,
                distrito != null ? distrito.getNombre() : null,
                anterior, nuevo, req.comentario()));

        return ReporteGestionResponse.from(guardado);
    }

    /**
     * US-15: asigna un responsable interno al reporte. Solo el funcionario del
     * distrito del reporte, solo en estados de gestion activa (RECIBIDO /
     * EN_PROCESO). Reasignar desactiva la asignacion vigente y crea una nueva
     * (el historial de asignaciones se conserva). Cada asignacion deja una
     * traza ASIGNACION en la linea de tiempo unica de la gestion.
     */
    @Transactional
    public AsignacionResponsableResponse asignarResponsable(String emailFuncionario, Long reporteId,
                                                            AsignarResponsableRequest req) {
        Usuario funcionario = usuarioConsultaService.usuarioPorEmail(emailFuncionario);
        Reporte reporte = reporteRepository.findById(reporteId)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));

        verificarJurisdiccion(funcionario, reporte);

        if (!ESTADOS_ASIGNABLES.contains(reporte.getEstado())) {
            throw new BusinessException(
                    "No se puede asignar responsable a un reporte en estado " + reporte.getEstado());
        }

        Optional<AsignacionResponsable> vigente = asignacionRepository.findByReporteIdAndActivoTrue(reporteId);
        boolean esReasignacion = vigente.isPresent();
        vigente.ifPresent(previa -> {
            previa.setActivo(false);
            asignacionRepository.save(previa);
        });

        AsignacionResponsable nueva = asignacionRepository.save(AsignacionResponsable.builder()
                .reporte(reporte)
                .responsable(req.responsable())
                .notas(req.notas())
                .asignadoPor(funcionario)
                .activo(true)
                .build());

        // Traza auditable en la linea de tiempo unica (US-15): fila ASIGNACION,
        // sin estado (no es una transicion). Su dato vive en asignacion_responsable.
        historialRepository.save(HistorialEstadoReporte.builder()
                .reporte(reporte)
                .tipoEvento(TipoEventoHistorial.ASIGNACION)
                .comentario((esReasignacion ? "Responsable reasignado: " : "Responsable asignado: ")
                        + req.responsable())
                .autor(funcionario)
                .build());

        return AsignacionResponsableResponse.from(nueva);
    }

    /** US-15: responsable vigente del reporte (con control de jurisdiccion). */
    @Transactional(readOnly = true)
    public AsignacionResponsableResponse responsableActivo(String emailFuncionario, Long reporteId) {
        Usuario funcionario = usuarioConsultaService.usuarioPorEmail(emailFuncionario);
        Reporte reporte = reporteRepository.findById(reporteId)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));

        verificarJurisdiccion(funcionario, reporte);

        return asignacionRepository.findByReporteIdAndActivoTrue(reporteId)
                .map(AsignacionResponsableResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("El reporte no tiene responsable asignado"));
    }

    private Distrito distritoDeGestion(String emailFuncionario) {
        Usuario funcionario = usuarioConsultaService.usuarioPorEmail(emailFuncionario);
        if (funcionario.getDistrito() == null) {
            throw new AccessDeniedException("El funcionario no tiene un distrito de gestion asignado");
        }
        return funcionario.getDistrito();
    }

    /** Solo el funcionario del distrito del reporte puede gestionarlo. */
    private void verificarJurisdiccion(Usuario funcionario, Reporte reporte) {
        Distrito distritoFuncionario = funcionario.getDistrito();
        if (distritoFuncionario == null || reporte.getDistrito() == null
                || !distritoFuncionario.getId().equals(reporte.getDistrito().getId())) {
            throw new AccessDeniedException("No puede gestionar reportes de otro distrito");
        }
    }
}
