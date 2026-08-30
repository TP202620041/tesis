package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.reportes.domain.Calificacion;

/** Calificacion devuelta por la API (US-26). */
public record CalificacionResponse(
        Long id,
        Long reporteId,
        int estrellas,
        String comentario,
        Instant createdAt
) {
    public static CalificacionResponse from(Calificacion c) {
        return new CalificacionResponse(
                c.getId(),
                c.getReporte().getId(),
                c.getEstrellas(),
                c.getComentario(),
                c.getCreatedAt());
    }
}
