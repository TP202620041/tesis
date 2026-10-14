package pe.edu.upc.viasegura.notificaciones.infra;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;
import pe.edu.upc.viasegura.notificaciones.port.NotificacionCanalAdapter;
import pe.edu.upc.viasegura.notificaciones.repository.SuscripcionPushRepository;

/**
 * Canal PUSH: disponibilidad real, envio todavia <strong>stub</strong>.
 *
 * <p>Desde NC-07 la PWA registra sus suscripciones (endpoint + claves
 * p256dh/auth) en {@code suscripcion_push}, asi que el canal se reporta
 * disponible cuando el usuario tiene al menos una suscripcion activa.</p>
 *
 * <p>El envio Web Push (VAPID + cifrado del mensaje) es US-21 (Sprint 3):
 * hasta entonces {@link #enviar} lanza, y {@code NotificacionService} lo
 * registra como {@code FALLIDA} y cae a EMAIL (fallback US-16 Esc.2), igual
 * que cuando el canal no esta disponible. El ciudadano no pierde avisos.</p>
 *
 * <p>TODO(US-21): implementar {@link #enviar} con las claves VAPID contra
 * cada suscripcion activa, y marcar {@code activa = false} las que el
 * servicio de push responda como caducadas (404/410).</p>
 */
@Component
@RequiredArgsConstructor
public class PushNotificacionAdapter implements NotificacionCanalAdapter {

    private final SuscripcionPushRepository suscripcionPushRepository;

    @Override
    public CanalNotificacion canal() {
        return CanalNotificacion.PUSH;
    }

    @Override
    public boolean estaDisponible(Usuario destinatario) {
        return suscripcionPushRepository.existsByUsuarioIdAndActivaTrue(destinatario.getId());
    }

    @Override
    public void enviar(Usuario destinatario, String asunto, String mensaje) {
        throw new UnsupportedOperationException(
                "Envio push pendiente (US-21) para el usuario " + destinatario.getId());
    }
}
