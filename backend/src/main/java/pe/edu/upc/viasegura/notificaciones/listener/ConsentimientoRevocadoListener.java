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
 * <p>{@code AFTER_COMMIT}, como el resto de los listeners (ARCHITECTURE.md
 * 4.5): la revocacion se confirma aunque este borrado falle, porque revocar
 * tiene que ser simple y no depender de otro modulo (Ley N.° 29733).
 * {@code SuscripcionPushService#eliminarTodasDelUsuario} abre su propia
 * transaccion ({@code REQUIRES_NEW}). Si el borrado fallara, las filas que
 * queden son inertes: {@code NotificacionService} exige el permiso vigente
 * antes de usar el canal PUSH.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ConsentimientoRevocadoListener {

    private final SuscripcionPushService suscripcionPushService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alRevocar(ConsentimientoRevocadoEvent evento) {
        if (evento.finalidad() != FinalidadConsentimiento.NOTIFICACIONES_PUSH) {
            return;
        }
        int borradas = suscripcionPushService.eliminarTodasDelUsuario(evento.usuarioId());
        log.debug("Consentimiento push revocado por el usuario {}: {} suscripciones borradas",
                evento.usuarioId(), borradas);
    }
}
