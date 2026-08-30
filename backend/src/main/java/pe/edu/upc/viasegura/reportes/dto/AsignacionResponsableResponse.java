package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.reportes.domain.AsignacionResponsable;

/** Asignacion de responsable devuelta por la API de gestion (US-15). */
public record AsignacionResponsableResponse(
        Long id,
        Long reporteId,
        String responsable,
        String notas,
        Long asignadoPorId,
        boolean activo,
        Instant createdAt
) {
    public static AsignacionResponsableResponse from(AsignacionResponsable a) {
        return new AsignacionResponsableResponse(
                a.getId(),
                a.getReporte().getId(),
                a.getResponsable(),
                a.getNotas(),
                a.getAsignadoPor() != null ? a.getAsignadoPor().getId() : null,
                a.isActivo(),
                a.getCreatedAt());
    }
}
