package pe.edu.upc.viasegura.notificaciones.port;

import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;

/**
 * Estrategia de envio por canal (patron Strategy/Adapter, US-16/US-21).
 *
 * <p>Cada implementacion encapsula un canal ({@link CanalNotificacion}). El
 * orquestador ({@code NotificacionService}) elige el adapter segun la
 * preferencia del ciudadano y aplica el fallback a email cuando el canal
 * preferido no esta disponible o falla.</p>
 */
public interface NotificacionCanalAdapter {

    /** Canal que implementa este adapter. */
    CanalNotificacion canal();

    /**
     * Si el canal puede entregar al destinatario aqui y ahora (p.ej. push
     * requiere una suscripcion registrada; email requiere una direccion).
     * Cuando devuelve {@code false}, el orquestador aplica el fallback.
     */
    boolean estaDisponible(Usuario destinatario);

    /**
     * Envia el mensaje. Debe lanzar una excepcion si el envio falla, para
     * que el orquestador lo registre como {@code FALLIDA} y active el
     * fallback si corresponde.
     */
    void enviar(Usuario destinatario, String asunto, String mensaje);
}
