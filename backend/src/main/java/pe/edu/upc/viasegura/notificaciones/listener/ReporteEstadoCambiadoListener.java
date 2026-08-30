package pe.edu.upc.viasegura.notificaciones.listener;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.notificaciones.service.NotificacionService;
import pe.edu.upc.viasegura.reportes.event.ReporteEstadoCambiadoEvent;

/**
 * Escucha el cambio de estado de un reporte (US-14) y dispara la
 * notificacion al ciudadano (US-16/US-21).
 *
 * <p>Se ejecuta {@code AFTER_COMMIT}: solo notifica si la transaccion del
 * cambio de estado realmente se confirmo, evitando avisar sobre un cambio
 * que luego hizo rollback. {@code NotificacionService} abre su propia
 * transaccion para persistir las notificaciones.</p>
 */
@Component
@RequiredArgsConstructor
public class ReporteEstadoCambiadoListener {

    private final NotificacionService notificacionService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCambiarEstado(ReporteEstadoCambiadoEvent evento) {
        notificacionService.notificarCambioEstado(evento);
    }
}
