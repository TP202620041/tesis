package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;

/**
 * Solicitud de cambio de estado de un reporte (US-14).
 *
 * @param estado     nuevo estado destino
 * @param comentario motivo/observacion; obligatorio cuando el estado es
 *                   RECHAZADO (validado en el servicio)
 */
public record CambiarEstadoRequest(
        @NotNull(message = "Elige el nuevo estado")
        EstadoReporte estado,
        @Size(max = 1000, message = "El comentario puede tener como máximo {max} caracteres")
        String comentario
) {}
