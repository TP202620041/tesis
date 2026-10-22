package pe.edu.upc.viasegura.auth.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.auth.event.RecuperacionSolicitadaEvent;
import pe.edu.upc.viasegura.auth.service.PasswordResetService;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.CorreoSaliente;

/**
 * Envia el correo de recuperacion de contrasena (US-03) despues del commit,
 * fuera de la peticion y sin transaccion abierta (DEP-08, patron de D-13).
 *
 * <p>{@code AFTER_COMMIT}: solo se envia un token que quedo guardado. El
 * listener no espera al proveedor: encola el envio en el executor acotado de
 * {@link AsyncConfig} y vuelve. En ese hilo pide el mensaje a
 * {@link PasswordResetService#mensajeDeRecuperacion} (lectura corta, en su
 * propia transaccion) y lo envia por {@link CorreoSaliente}. El contenido del
 * correo sigue en el servicio de {@code auth}; este listener no toca
 * repositorios ni arma textos.</p>
 *
 * <p><b>Encola explicitamente, sin {@code @Async}:</b> con la cola llena el
 * executor rechaza la tarea, y aqui se registra <b>que</b> correo se pierde
 * (el id del token), como hace {@code ReporteEstadoCambiadoListener}. Con
 * {@code @Async} en este metodo, el rechazo lo atraparia la sincronizacion de
 * la transaccion de Spring y quedaria un error generico sin el token.</p>
 *
 * <p>Si el envio falla, se registra con el id del token, nunca el correo ni el
 * token, y el token queda guardado: la persona puede volver a pedirlo.</p>
 */
@Slf4j
@Component
public class RecuperacionSolicitadaListener {

    private final PasswordResetService passwordResetService;
    private final CorreoSaliente correo;
    private final TaskExecutor ejecutor;

    public RecuperacionSolicitadaListener(PasswordResetService passwordResetService, CorreoSaliente correo,
                                          @Qualifier(AsyncConfig.EJECUTOR) TaskExecutor ejecutor) {
        this.passwordResetService = passwordResetService;
        this.correo = correo;
        this.ejecutor = ejecutor;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alSolicitarRecuperacion(RecuperacionSolicitadaEvent evento) {
        try {
            ejecutor.execute(() -> enviar(evento.tokenId()));
        } catch (TaskRejectedException e) {
            log.warn("Cola asincrona llena: no se envia el correo de recuperacion del token {} "
                    + "(la persona puede volver a pedirlo)", evento.tokenId());
        }
    }

    /** Corre en el executor asincrono. Nunca lanza: el hilo no tiene a quien avisarle. */
    private void enviar(Long tokenId) {
        try {
            passwordResetService.mensajeDeRecuperacion(tokenId).ifPresentOrElse(
                    correo::enviar,
                    () -> log.info("El token de recuperacion {} se uso o vencio antes del envio: no se envia",
                            tokenId));
        } catch (CorreoNoEnviadoException e) {
            log.warn("No se envio el correo de recuperacion del token {}: {}", tokenId, e.getMessage());
        } catch (RuntimeException e) {
            log.error("Error al preparar el correo de recuperacion del token {}", tokenId, e);
        }
    }
}
