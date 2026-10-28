package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/** Pedido de un enlace de confirmacion nuevo (NC-09). */
public record ReenviarConfirmacionRequest(
        @NotBlank(message = "Ingresa tu correo")
        @Email(message = "El correo no tiene un formato válido")
        String email
) {}
