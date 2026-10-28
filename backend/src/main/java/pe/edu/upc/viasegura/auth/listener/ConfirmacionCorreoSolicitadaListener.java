package pe.edu.upc.viasegura.auth.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.auth.event.ConfirmacionCorreoSolicitadaEvent;
import pe.edu.upc.viasegura.auth.service.ConfirmacionCorreoService;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.CorreoSaliente;

/**
 * Envia el correo con el enlace de confirmacion (NC-09) despues del commit,
 * fuera de la peticion y sin transaccion abierta. Mismo patron que
 * {@code RecuperacionSolicitadaListener} (DEP-08, D-13).
 *
 * <p>{@code AFTER_COMMIT}: solo se envia el enlace de una cuenta que quedo
 * creada. El listener encola en el executor acotado de {@link AsyncConfig} y
 * vuelve, sin {@code @Async}, para registrar <b>que</b> correo se pierde si la
 * cola esta llena. En ese hilo, {@link ConfirmacionCorreoService#emitirMensaje}
 * genera el token, guarda su hash (una transaccion corta) y devuelve el
 * mensaje; el envio por {@link CorreoSaliente} ocurre despues, sin
 * transaccion.</p>
 *
 * <p>Si el envio falla, se registra con el id de la fila, nunca el correo ni
 * el token. La persona puede pedir otro enlace desde el inicio de sesion.</p>
 */
@Slf4j
@Component
public class ConfirmacionCorreoSolicitadaListener {

    private final ConfirmacionCorreoService confirmacionCorreoService;
    private final CorreoSaliente correo;
    private final TaskExecutor ejecutor;

    public ConfirmacionCorreoSolicitadaListener(ConfirmacionCorreoService confirmacionCorreoService,
                                                CorreoSaliente correo,
                                                @Qualifier(AsyncConfig.EJECUTOR) TaskExecutor ejecutor) {
        this.confirmacionCorreoService = confirmacionCorreoService;
        this.correo = correo;
        this.ejecutor = ejecutor;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alSolicitarConfirmacion(ConfirmacionCorreoSolicitadaEvent evento) {
        try {
            ejecutor.execute(() -> enviar(evento.tokenId()));
        } catch (TaskRejectedException e) {
            log.warn("Cola asincrona llena: no se envia el correo de confirmacion {} "
                    + "(la persona puede pedir otro enlace)", evento.tokenId());
        }
    }

    /** Corre en el executor asincrono. Nunca lanza: el hilo no tiene a quien avisarle. */
    private void enviar(Long tokenId) {
        try {
            confirmacionCorreoService.emitirMensaje(tokenId).ifPresentOrElse(
                    correo::enviar,
                    () -> log.info("El enlace de confirmacion {} ya no se envia: se anulo, vencio o la cuenta"
                            + " ya esta confirmada", tokenId));
        } catch (CorreoNoEnviadoException e) {
            log.warn("No se envio el correo de confirmacion {}: {}", tokenId, e.getMessage());
        } catch (RuntimeException e) {
            log.error("Error al preparar el correo de confirmacion {}", tokenId, e);
        }
    }
}
