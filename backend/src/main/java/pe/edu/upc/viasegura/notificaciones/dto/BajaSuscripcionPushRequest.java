package pe.edu.upc.viasegura.notificaciones.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Baja de la suscripcion Web Push de este navegador (NC-07). */
public record BajaSuscripcionPushRequest(
        @NotBlank(message = "Falta la dirección de la suscripción push")
        @Size(max = 2048, message = "La dirección de la suscripción push puede tener como máximo {max} caracteres")
        String endpoint
) {}
