package pe.edu.upc.viasegura.notificaciones.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.notificaciones.domain.SuscripcionPush;

/**
 * Suscripcion registrada (NC-07). No devuelve las claves {@code p256dh} ni
 * {@code auth}: el navegador ya las tiene y no hay motivo para que viajen de
 * vuelta ni para que queden en logs o caches intermedias.
 */
public record SuscripcionPushResponse(
        String endpoint,
        String userAgent,
        boolean activa,
        Instant creadaEn,
        Instant actualizadaEn
) {

    public static SuscripcionPushResponse desde(SuscripcionPush s) {
        return new SuscripcionPushResponse(
                s.getEndpoint(), s.getUserAgent(), s.isActiva(), s.getCreatedAt(), s.getUpdatedAt());
    }
}
