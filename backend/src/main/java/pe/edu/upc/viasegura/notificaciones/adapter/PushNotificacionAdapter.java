package pe.edu.upc.viasegura.notificaciones.adapter;

import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;

/**
 * Canal PUSH: <strong>stub documentado</strong>.
 *
 * <p>Un Web Push real (VAPID) requiere un frontend PWA que registre una
 * suscripcion (endpoint + claves p256dh/auth) por dispositivo. Ese modulo
 * aun no existe, asi que no hay ningun suscriptor al que entregar: el canal
 * se reporta como <em>no disponible</em> y el orquestador cae a EMAIL
 * (fallback US-16 Escenario 2). Esto mantiene el fallback demostrable
 * end-to-end hoy sin infraestructura sin consumidor.</p>
 *
 * <p>TODO(US-PWA/push-real): cuando exista la PWA con suscripcion, reemplazar
 * este stub por el envio Web Push real: persistir suscripciones en una tabla
 * {@code push_subscription}, configurar el par de claves VAPID, y hacer que
 * {@link #estaDisponible(Usuario)} devuelva {@code true} solo si el usuario
 * tiene al menos una suscripcion activa, e implementar {@link #enviar}.</p>
 */
@Component
public class PushNotificacionAdapter implements NotificacionCanalAdapter {

    @Override
    public CanalNotificacion canal() {
        return CanalNotificacion.PUSH;
    }

    @Override
    public boolean estaDisponible(Usuario destinatario) {
        // Sin suscripciones PWA registradas todavia: nunca disponible.
        return false;
    }

    @Override
    public void enviar(Usuario destinatario, String asunto, String mensaje) {
        throw new UnsupportedOperationException(
                "Push no implementado: no hay suscripcion PWA para el usuario " + destinatario.getId());
    }
}
