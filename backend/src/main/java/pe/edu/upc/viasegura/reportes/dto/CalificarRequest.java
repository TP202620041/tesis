package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * Calificacion por estrellas de la atencion recibida (US-26). El puntaje
 * fuera de 1..5 es un error de entrada (400), distinto de las precondiciones
 * de estado del reporte (409).
 */
public record CalificarRequest(
        @Min(1) @Max(5) int estrellas,
        @Size(max = 1000) String comentario
) {}
