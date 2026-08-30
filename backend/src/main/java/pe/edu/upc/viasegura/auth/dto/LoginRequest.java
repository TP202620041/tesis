package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Credenciales de inicio de sesion (US-02). */
public record LoginRequest(
        @NotBlank @Email String email,
        @NotBlank String password
) {}
