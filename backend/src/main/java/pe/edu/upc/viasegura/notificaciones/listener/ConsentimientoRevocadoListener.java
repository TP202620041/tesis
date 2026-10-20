package pe.edu.upc.viasegura.notificaciones.listener;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.event.ConsentimientoRevocadoEvent;
import pe.edu.upc.viasegura.notificaciones.service.SuscripcionPushService;

/**
 * Al revocar el consentimiento {@code NOTIFICACIONES_PUSH} (D-12) se borran
 * las suscripciones push del usuario.
 *
 * <p>Se ejecuta {@code BEFORE_COMMIT}, no {@code AFTER_COMMIT} como el resto
 * de los listeners, a proposito: la revocacion y el borrado tienen que ser
 * atomicos. Con {@code AFTER_COMMIT}, si el borrado fallara quedaria la
 * revocacion confirmada y las claves de envio vivas, es decir, push sin
 * permiso (Ley N.° 29733). Aqui, si el borrado falla, la revocacion hace
 * rollback y el usuario recibe el error. No hay efectos externos que
 * esperar al commit: solo es una escritura en la misma base.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ConsentimientoRevocadoListener {

    private final SuscripcionPushService suscripcionPushService;

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void alRevocar(ConsentimientoRevocadoEvent evento) {
        if (evento.finalidad() != FinalidadConsentimiento.NOTIFICACIONES_PUSH) {
            return;
        }
        int borradas = suscripcionPushService.eliminarTodasDelUsuario(evento.usuarioId());
        log.debug("Consentimiento push revocado por el usuario {}: {} suscripciones borradas",
                evento.usuarioId(), borradas);
    }
}
