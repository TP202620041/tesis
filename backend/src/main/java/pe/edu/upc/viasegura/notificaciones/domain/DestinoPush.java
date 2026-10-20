package pe.edu.upc.viasegura.notificaciones.domain;

/**
 * A donde se entrega un push: el endpoint del servicio de push del navegador
 * y las claves con las que se cifra el mensaje (de {@link SuscripcionPush}).
 */
public record DestinoPush(String endpoint, String p256dh, String auth) {

    public static DestinoPush de(SuscripcionPush s) {
        return new DestinoPush(s.getEndpoint(), s.getP256dh(), s.getAuth());
    }
}
