package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.NotNull;
import pe.edu.upc.viasegura.auth.domain.PreferenciaNotificacion;

/**
 * Cambio del canal de notificacion preferido por el ciudadano (US-30, parte
 * minima). El resto del perfil (nombre, foto, distrito de residencia) queda
 * para un slice dedicado de Perfil ciudadano.
 */
public record ActualizarPreferenciaRequest(
        @NotNull PreferenciaNotificacion preferenciaNotificacion
) {}
