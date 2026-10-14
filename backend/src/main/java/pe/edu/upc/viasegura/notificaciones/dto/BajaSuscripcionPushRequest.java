package pe.edu.upc.viasegura.notificaciones.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Baja de la suscripcion Web Push de este navegador (NC-07). */
public record BajaSuscripcionPushRequest(
        @NotBlank @Size(max = 2048) String endpoint
) {}
