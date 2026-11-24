package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Credenciales de inicio de sesion (US-02). */
public record LoginRequest(
        @NotBlank(message = "Ingresa tu correo")
        @Email(message = "El correo no tiene un formato válido")
        // Largo de usuario.email y de la clave de intento_login (US-02).
        @Size(max = 150, message = "El correo puede tener como máximo {max} caracteres")
        String email,
        @NotBlank(message = "Ingresa tu contraseña")
        String password
) {}
