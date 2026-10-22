package pe.edu.upc.viasegura.soporte.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Consulta de soporte del usuario autenticado (US-25). El correo de
 * contacto no se pide: se toma de la cuenta autenticada, para no
 * permitir que el cliente lo falsifique.
 */
public record CrearTicketRequest(
        @NotBlank(message = "Escribe el asunto")
        @Size(max = 200, message = "El asunto puede tener como máximo {max} caracteres")
        String asunto,
        @NotBlank(message = "Escribe tu mensaje")
        @Size(max = 2000, message = "El mensaje puede tener como máximo {max} caracteres")
        String mensaje
) {}
