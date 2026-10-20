package pe.edu.upc.viasegura.notificaciones.listener;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.task.TaskRejectedException;
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
 * que luego hizo rollback. El listener en si es inmediato: solo encola
 * {@code NotificacionService#notificarCambioEstado}, que es {@code @Async} en
 * el executor acotado de {@code AsyncConfig}. Los envios (SMTP, HTTP al
 * servicio de push) no bloquean al funcionario que cambio el estado.</p>
 *
 * <p>Si la cola esta llena, el executor rechaza la tarea
 * ({@code TaskRejectedException}) y aqui se registra <b>que</b> aviso se
 * pierde (reporte, ciudadano y estado) y se descarta, sin reintentar en el
 * hilo de la peticion.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReporteEstadoCambiadoListener {

    private final NotificacionService notificacionService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCambiarEstado(ReporteEstadoCambiadoEvent evento) {
        try {
            notificacionService.notificarCambioEstado(evento);
        } catch (TaskRejectedException e) {
            log.warn("Cola asincrona llena: se pierde el aviso del reporte {} al usuario {} (paso a {})",
                    evento.reporteId(), evento.creadorId(), evento.nuevo());
        }
    }
}
