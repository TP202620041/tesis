package pe.edu.upc.viasegura.notificaciones.service;

import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.PreferenciaNotificacion;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.notificaciones.adapter.NotificacionCanalAdapter;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;
import pe.edu.upc.viasegura.notificaciones.domain.EstadoEntrega;
import pe.edu.upc.viasegura.notificaciones.domain.Notificacion;
import pe.edu.upc.viasegura.notificaciones.domain.TipoEvento;
import pe.edu.upc.viasegura.notificaciones.repository.NotificacionRepository;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.event.ReporteEstadoCambiadoEvent;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Orquesta la notificacion al ciudadano ante un cambio de estado de su
 * reporte (US-16, US-21).
 *
 * <p>Elige el/los canal(es) segun la preferencia del ciudadano, delega el
 * envio en el {@link NotificacionCanalAdapter} correspondiente y persiste
 * cada intento en {@code notificacion} con su {@link EstadoEntrega}. Aplica
 * el fallback push -> email de US-16 (Escenario 2): si el canal PUSH no esta
 * disponible o falla, entrega por EMAIL.</p>
 */
@Slf4j
@Service
public class NotificacionService {

    private final Map<CanalNotificacion, NotificacionCanalAdapter> adapters =
            new EnumMap<>(CanalNotificacion.class);
    private final NotificacionRepository notificacionRepository;
    private final UsuarioRepository usuarioRepository;
    private final ReporteRepository reporteRepository;

    public NotificacionService(List<NotificacionCanalAdapter> adapterList,
                               NotificacionRepository notificacionRepository,
                               UsuarioRepository usuarioRepository,
                               ReporteRepository reporteRepository) {
        adapterList.forEach(a -> adapters.put(a.canal(), a));
        this.notificacionRepository = notificacionRepository;
        this.usuarioRepository = usuarioRepository;
        this.reporteRepository = reporteRepository;
    }

    /**
     * Notifica el cambio de estado. Se invoca desde el listener AFTER_COMMIT,
     * por lo que abre su propia transaccion: un fallo de envio no puede
     * revertir el cambio de estado (que ya se confirmo) y solo afecta el
     * registro de la notificacion.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notificarCambioEstado(ReporteEstadoCambiadoEvent evento) {
        TipoEvento tipo = tipoEventoDe(evento.nuevo());
        if (tipo == null) {
            return; // estados que no notifican al ciudadano (p.ej. PENDIENTE)
        }
        Usuario destinatario = usuarioRepository.findById(evento.creadorId()).orElse(null);
        if (destinatario == null) {
            log.warn("Reporte {} sin destinatario ({}): no se notifica",
                    evento.reporteId(), evento.creadorId());
            return;
        }
        // Referencia (proxy) para la FK; no se necesita cargar el reporte entero.
        Reporte reporte = reporteRepository.getReferenceById(evento.reporteId());
        String asunto = asuntoDe(tipo);
        String mensaje = componerMensaje(destinatario, evento);

        List<CanalNotificacion> objetivos = canalesSegunPreferencia(destinatario.getPreferenciaNotificacion());
        boolean emailEntregado = false;
        boolean pushFallo = false;

        for (CanalNotificacion canal : objetivos) {
            boolean ok = intentarEnviar(canal, destinatario, reporte, tipo, asunto, mensaje);
            if (canal == CanalNotificacion.EMAIL && ok) {
                emailEntregado = true;
            }
            if (canal == CanalNotificacion.PUSH && !ok) {
                pushFallo = true;
            }
        }

        // Fallback US-16 Esc.2: push no entrego y email no era objetivo aun.
        if (pushFallo && !emailEntregado && !objetivos.contains(CanalNotificacion.EMAIL)) {
            log.info("Push no disponible para usuario {}: fallback a email", destinatario.getId());
            intentarEnviar(CanalNotificacion.EMAIL, destinatario, reporte, tipo, asunto, mensaje);
        }
    }

    /** Intenta un canal y persiste el resultado. Devuelve true si se entrego. */
    private boolean intentarEnviar(CanalNotificacion canal, Usuario destinatario, Reporte reporte,
                                   TipoEvento tipo, String asunto, String mensaje) {
        Notificacion notificacion = Notificacion.builder()
                .usuario(destinatario)
                .reporte(reporte)
                .tipoEvento(tipo)
                .canal(canal)
                .mensaje(mensaje)
                .build();

        NotificacionCanalAdapter adapter = adapters.get(canal);
        try {
            if (adapter == null || !adapter.estaDisponible(destinatario)) {
                notificacion.setEstadoEntrega(EstadoEntrega.FALLIDA);
                notificacionRepository.save(notificacion);
                return false;
            }
            adapter.enviar(destinatario, asunto, mensaje);
            notificacion.setEstadoEntrega(EstadoEntrega.ENVIADA);
            notificacion.setSentAt(Instant.now());
            notificacionRepository.save(notificacion);
            return true;
        } catch (RuntimeException e) {
            notificacion.setEstadoEntrega(EstadoEntrega.FALLIDA);
            notificacionRepository.save(notificacion);
            log.warn("Fallo envio {} a usuario {}: {}", canal, destinatario.getId(), e.getMessage());
            return false;
        }
    }

    private List<CanalNotificacion> canalesSegunPreferencia(PreferenciaNotificacion preferencia) {
        return switch (preferencia) {
            case PUSH -> List.of(CanalNotificacion.PUSH);
            case EMAIL -> List.of(CanalNotificacion.EMAIL);
            // Sin preferencia explicita el default es AMBAS (columna NOT NULL).
            case AMBAS -> List.of(CanalNotificacion.PUSH, CanalNotificacion.EMAIL);
        };
    }

    private TipoEvento tipoEventoDe(EstadoReporte estado) {
        return switch (estado) {
            case RECIBIDO -> TipoEvento.REPORTE_RECIBIDO;
            case EN_PROCESO -> TipoEvento.REPORTE_EN_PROCESO;
            case RESUELTO -> TipoEvento.REPORTE_RESUELTO;
            case RECHAZADO -> TipoEvento.REPORTE_RECHAZADO;
            // PENDIENTE: estado inicial, nada que notificar. CANCELADO
            // (US-08): lo origina el propio ciudadano, no tiene sentido
            // notificarlo de su propia accion.
            case PENDIENTE, CANCELADO -> null;
        };
    }

    private String asuntoDe(TipoEvento tipo) {
        return switch (tipo) {
            case REPORTE_RECIBIDO -> "ViaSegura: su reporte fue recibido";
            case REPORTE_EN_PROCESO -> "ViaSegura: su reporte esta en proceso";
            case REPORTE_RESUELTO -> "ViaSegura: su reporte fue resuelto";
            case REPORTE_RECHAZADO -> "ViaSegura: su reporte fue rechazado";
            case ADHESION_REGISTRADA -> "ViaSegura: novedad en su reporte";
        };
    }

    /** Mensaje al ciudadano (<= 500 chars, ver columna notificacion.mensaje). */
    private String componerMensaje(Usuario destinatario, ReporteEstadoCambiadoEvent evento) {
        StringBuilder sb = new StringBuilder()
                .append("Hola ").append(destinatario.getNombre()).append(", su reporte");
        if (evento.distritoNombre() != null) {
            sb.append(" en el distrito de ").append(evento.distritoNombre());
        }
        sb.append(" paso de ").append(evento.anterior())
                .append(" a ").append(evento.nuevo()).append(".");
        if (evento.comentario() != null && !evento.comentario().isBlank()) {
            sb.append(" Comentario del municipio: ").append(evento.comentario());
        }
        String mensaje = sb.toString();
        return mensaje.length() > 500 ? mensaje.substring(0, 500) : mensaje;
    }
}
