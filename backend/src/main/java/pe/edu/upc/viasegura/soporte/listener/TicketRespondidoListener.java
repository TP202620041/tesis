package pe.edu.upc.viasegura.soporte.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.CorreoSaliente;
import pe.edu.upc.viasegura.soporte.event.TicketRespondidoEvent;
import pe.edu.upc.viasegura.soporte.service.TicketSoporteService;

/**
 * Avisa por correo que un ticket fue respondido (US-25, Esc. 2) despues del
 * commit, fuera de la peticion y sin transaccion abierta (DEP-08, patron de
 * D-13). Mismo esquema que {@code RecuperacionSolicitadaListener}: encola en
 * el executor acotado de {@link AsyncConfig} (y registra el ticket si la cola
 * esta llena), pide el mensaje a {@link TicketSoporteService#mensajeDeRespuesta}
 * y lo envia por {@link CorreoSaliente}.
 *
 * <p><b>Cambio de comportamiento:</b> antes un fallo del correo revertia la
 * respuesta del ADMIN y el API daba 500. Ahora la respuesta queda guardada (el
 * usuario la ve en {@code GET /mis-tickets}) y el fallo solo se registra: el
 * correo es un aviso, no la respuesta.</p>
 */
@Slf4j
@Component
public class TicketRespondidoListener {

    private final TicketSoporteService ticketSoporteService;
    private final CorreoSaliente correo;
    private final TaskExecutor ejecutor;

    public TicketRespondidoListener(TicketSoporteService ticketSoporteService, CorreoSaliente correo,
                                    @Qualifier(AsyncConfig.EJECUTOR) TaskExecutor ejecutor) {
        this.ticketSoporteService = ticketSoporteService;
        this.correo = correo;
        this.ejecutor = ejecutor;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alResponder(TicketRespondidoEvent evento) {
        try {
            ejecutor.execute(() -> enviar(evento.ticketId()));
        } catch (TaskRejectedException e) {
            log.warn("Cola asincrona llena: no se avisa por correo la respuesta del ticket {} "
                    + "(la respuesta quedo guardada)", evento.ticketId());
        }
    }

    /** Corre en el executor asincrono. Nunca lanza: el hilo no tiene a quien avisarle. */
    private void enviar(Long ticketId) {
        try {
            ticketSoporteService.mensajeDeRespuesta(ticketId).ifPresentOrElse(
                    correo::enviar,
                    () -> log.info("El ticket {} no tiene respuesta o correo de contacto: no se envia", ticketId));
        } catch (CorreoNoEnviadoException e) {
            log.warn("No se envio el correo de respuesta del ticket {}: {}", ticketId, e.getMessage());
        } catch (RuntimeException e) {
            log.error("Error al preparar el correo de respuesta del ticket {}", ticketId, e);
        }
    }
}
