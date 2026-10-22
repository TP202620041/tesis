package pe.edu.upc.viasegura.soporte.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pe.edu.upc.viasegura.soporte.domain.EstadoTicket;

/** Respuesta del equipo de soporte a un ticket (US-25 Esc.2), rol ADMIN. */
public record ResponderTicketRequest(
        @NotBlank(message = "Escribe la respuesta")
        @Size(max = 2000, message = "La respuesta puede tener como máximo {max} caracteres")
        String respuesta,
        @NotNull(message = "Elige el estado del ticket")
        EstadoTicket estado
) {}
