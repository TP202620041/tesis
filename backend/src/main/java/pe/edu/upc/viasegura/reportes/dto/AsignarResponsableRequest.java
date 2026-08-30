package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Asignacion de un responsable interno (cuadrilla) a un reporte (US-15).
 * El responsable es texto libre: hoy no existe una entidad Cuadrilla ni un
 * rol de responsable, solo el nombre operativo.
 */
public record AsignarResponsableRequest(
        @NotBlank @Size(max = 150) String responsable,
        @Size(max = 500) String notas
) {}
