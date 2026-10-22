package pe.edu.upc.viasegura.notificaciones.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Alta de una suscripcion Web Push (NC-07). Tiene la forma exacta de
 * {@code PushSubscription.toJSON()} del navegador, para que el frontend la
 * envie sin transformarla, mas un {@code userAgent} opcional para que el
 * usuario reconozca el dispositivo. {@code expirationTime} (que el navegador
 * tambien incluye, casi siempre {@code null}) se ignora.
 *
 * <p>El servicio de push de los navegadores siempre entrega un endpoint
 * HTTPS; se exige para no guardar algo que nunca podra recibir un envio.</p>
 */
public record SuscripcionPushRequest(
        @NotBlank(message = "Falta la dirección de la suscripción push")
        @Size(max = 2048, message = "La dirección de la suscripción push puede tener como máximo {max} caracteres")
        @Pattern(regexp = "^https://\\S+$", message = "La dirección de la suscripción push debe ser una URL https")
        String endpoint,
        @NotNull(message = "Faltan las claves de la suscripción push")
        @Valid
        ClavesRequest keys,
        @Size(max = 500, message = "El nombre del navegador puede tener como máximo {max} caracteres")
        String userAgent
) {

    /**
     * Las claves de cifrado del mensaje, en base64url. Sufijo {@code Request}
     * por la regla de ArchUnit de {@code dto/}.
     */
    public record ClavesRequest(
            @NotBlank(message = "Falta la clave p256dh de la suscripción push")
            @Size(max = 255, message = "La clave p256dh puede tener como máximo {max} caracteres")
            String p256dh,
            @NotBlank(message = "Falta la clave auth de la suscripción push")
            @Size(max = 255, message = "La clave auth puede tener como máximo {max} caracteres")
            String auth
    ) {}
}
