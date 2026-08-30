package pe.edu.upc.viasegura.soporte.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Consulta de soporte del usuario autenticado (US-25). El correo de
 * contacto no se pide: se toma de la cuenta autenticada, para no
 * permitir que el cliente lo falsifique.
 */
public record CrearTicketRequest(
        @NotBlank @Size(max = 200) String asunto,
        @NotBlank @Size(max = 2000) String mensaje
) {}
