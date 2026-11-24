package pe.edu.upc.viasegura.notificaciones.listener;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.auth.event.SesionesCerradasEvent;
import pe.edu.upc.viasegura.notificaciones.service.SuscripcionPushService;

/**
 * US-04 Esc. 2 y US-03: al cerrar la sesion en todos los dispositivos (a
 * pedido o al restablecer la contrasena) se borran las suscripciones push
 * del usuario. Un dispositivo con la sesion revocada no
 * debe seguir recibiendo avisos de esa cuenta; la PWA vuelve a registrar la
 * suscripcion del dispositivo cuando el usuario inicia sesion de nuevo.
 *
 * <p>Evento y {@code AFTER_COMMIT} (ARCHITECTURE.md 4.5) en vez de la misma
 * transaccion porque {@code notificaciones} ya depende de {@code auth}: que
 * {@code AuthService} llamara a {@code SuscripcionPushService} crearia un
 * ciclo entre modulos. Es el mismo patron que
 * {@link ConsentimientoRevocadoListener}. El cierre de sesiones se confirma
 * aunque este borrado falle: lo que protege la cuenta es revocar los tokens,
 * y un fallo aqui se registra sin convertir el 204 en un 500.
 * {@code SuscripcionPushService#eliminarTodasDelUsuario} abre su propia
 * transaccion ({@code REQUIRES_NEW}).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SesionesCerradasListener {

    private final SuscripcionPushService suscripcionPushService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCerrarSesiones(SesionesCerradasEvent evento) {
        try {
            int borradas = suscripcionPushService.eliminarTodasDelUsuario(evento.usuarioId());
            log.debug("Sesiones cerradas por el usuario {}: {} suscripciones push borradas",
                    evento.usuarioId(), borradas);
        } catch (RuntimeException e) {
            log.warn("No se pudieron borrar las suscripciones push del usuario {} tras cerrar sus sesiones",
                    evento.usuarioId(), e);
        }
    }
}
