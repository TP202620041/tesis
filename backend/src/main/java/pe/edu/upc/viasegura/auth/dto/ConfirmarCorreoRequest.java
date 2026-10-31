package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Confirmacion del correo con el token del enlace (NC-09): lo que la PWA lee
 * de {@code /confirmar-cuenta?token=…}. Un token real tiene 43 caracteres; el
 * tope solo corta cuerpos abusivos.
 */
public record ConfirmarCorreoRequest(
        @NotBlank(message = "Falta el código del enlace de confirmación")
        @Size(max = 100, message = "El enlace de confirmación no es válido")
        String token
) {}
