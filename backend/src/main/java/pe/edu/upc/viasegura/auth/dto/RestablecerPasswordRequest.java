package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Restablecimiento de contrasena con el token recibido por email (US-03). */
public record RestablecerPasswordRequest(
        @NotBlank String token,
        @NotBlank @Size(min = 8, max = 72) String nuevaPassword
) {}
