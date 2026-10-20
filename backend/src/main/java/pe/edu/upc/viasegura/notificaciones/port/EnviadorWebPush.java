package pe.edu.upc.viasegura.notificaciones.port;

import java.util.Optional;
import pe.edu.upc.viasegura.notificaciones.domain.DestinoPush;
import pe.edu.upc.viasegura.notificaciones.domain.ResultadoEnvioPush;

/**
 * Envio Web Push (US-21): firma VAPID, cifra el mensaje y lo entrega al
 * servicio de push del navegador. Lo implementa un adaptador de
 * {@code infra/} con una libreria concreta; en los IT se reemplaza por un
 * fake que registra lo enviado, para no llamar nunca a un servicio real.
 */
public interface EnviadorWebPush {

    /** Si hay claves VAPID validas. Sin ellas el canal PUSH no esta disponible. */
    boolean estaConfigurado();

    /** Clave publica VAPID (base64url, punto sin comprimir) para {@code pushManager.subscribe}. */
    Optional<String> clavePublica();

    /**
     * Entrega {@code payload} (JSON en UTF-8) a un navegador. No lanza: los
     * errores se devuelven como {@link ResultadoEnvioPush}.
     *
     * @param topico identificador corto: el servicio de push reemplaza un
     *               aviso pendiente del mismo topico por el nuevo
     */
    ResultadoEnvioPush enviar(DestinoPush destino, byte[] payload, String topico);
}
