package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Restablecimiento de contrasena con el token recibido por email (US-03). */
public record RestablecerPasswordRequest(
        @NotBlank(message = "Ingresa el token que recibiste por correo")
        String token,
        @NotBlank(message = "Ingresa la nueva contraseña")
        @Size(min = 8, max = 72, message = "La nueva contraseña debe tener entre {min} y {max} caracteres")
        String nuevaPassword
) {}
