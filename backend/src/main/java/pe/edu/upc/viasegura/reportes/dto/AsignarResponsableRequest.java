package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Asignacion de un responsable interno (cuadrilla) a un reporte (US-15).
 * El responsable es texto libre: hoy no existe una entidad Cuadrilla ni un
 * rol de responsable, solo el nombre operativo.
 */
public record AsignarResponsableRequest(
        @NotBlank(message = "Indica el responsable (cuadrilla o persona)")
        @Size(max = 150, message = "El responsable puede tener como máximo {max} caracteres")
        String responsable,
        @Size(max = 500, message = "Las notas pueden tener como máximo {max} caracteres")
        String notas
) {}
