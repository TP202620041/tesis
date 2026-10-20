package pe.edu.upc.viasegura.notificaciones.listener;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
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
 * que luego hizo rollback. Y es {@code @Async} en el executor acotado de
 * {@code AsyncConfig}: los envios (SMTP, HTTP al servicio de push) no
 * bloquean al funcionario que cambio el estado ni retienen su hilo. En los
 * IT ese executor es sincrono.</p>
 */
@Component
@RequiredArgsConstructor
public class ReporteEstadoCambiadoListener {

    private final NotificacionService notificacionService;

    @Async(AsyncConfig.EJECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCambiarEstado(ReporteEstadoCambiadoEvent evento) {
        notificacionService.notificarCambioEstado(evento);
    }
}
