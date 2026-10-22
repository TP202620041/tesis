package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Solicitud de recuperacion de contrasena por email (US-03). */
public record RecuperarPasswordRequest(
        @NotBlank(message = "Ingresa tu correo")
        @Email(message = "El correo no tiene un formato válido")
        String email
) {}
