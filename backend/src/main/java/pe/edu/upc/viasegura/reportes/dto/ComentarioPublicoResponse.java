package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.reportes.domain.ComentarioPublico;

/**
 * Comentario publico devuelto por la API (US-27).
 *
 * <p>Al ser un listado publico y sin autenticacion, se expone solo el nombre
 * del autor (no el correo ni el apellido completo).</p>
 *
 * <p><b>No incluye {@code posibleReincidencia} a proposito.</b> Ese flag
 * existe para dirigir la atencion de la municipalidad: marca el reporte
 * ({@code Reporte.posibleReincidencia}) y llega a la bandeja del funcionario
 * por {@link ReporteResumenResponse}. Publicarlo aqui no servia a ningun
 * consumidor y tenia un costo: revelar que comentarios marco el detector
 * permite sondear su lista de palabras clave probando redacciones y, como
 * ese flag resalta reportes en la bandeja, sondearlo es poder manipular en
 * que se fija el municipio.</p>
 */
public record ComentarioPublicoResponse(
        Long id,
        Long reporteId,
        String autor,
        String contenido,
        Instant createdAt
) {
    public static ComentarioPublicoResponse from(ComentarioPublico c) {
        return new ComentarioPublicoResponse(
                c.getId(),
                c.getReporte().getId(),
                c.getUsuario().getNombre(),
                c.getContenido(),
                c.getCreatedAt());
    }
}
