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
        @Min(value = 1, message = "La calificación debe ser de 1 a 5 estrellas")
        @Max(value = 5, message = "La calificación debe ser de 1 a 5 estrellas")
        int estrellas,
        @Size(max = 1000, message = "El comentario puede tener como máximo {max} caracteres")
        String comentario
) {}
