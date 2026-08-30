package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.reportes.domain.ComentarioPublico;

/**
 * Comentario publico devuelto por la API (US-27). Al ser un listado publico,
 * se expone solo el nombre del autor (no el correo ni el apellido completo).
 */
public record ComentarioPublicoResponse(
        Long id,
        Long reporteId,
        String autor,
        String contenido,
        boolean posibleReincidencia,
        Instant createdAt
) {
    public static ComentarioPublicoResponse from(ComentarioPublico c) {
        return new ComentarioPublicoResponse(
                c.getId(),
                c.getReporte().getId(),
                c.getUsuario().getNombre(),
                c.getContenido(),
                c.isPosibleReincidencia(),
                c.getCreatedAt());
    }
}
