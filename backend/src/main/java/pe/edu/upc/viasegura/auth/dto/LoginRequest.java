package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Credenciales de inicio de sesion (US-02). */
public record LoginRequest(
        @NotBlank(message = "Ingresa tu correo")
        @Email(message = "El correo no tiene un formato válido")
        String email,
        @NotBlank(message = "Ingresa tu contraseña")
        String password
) {}
