package pe.edu.upc.viasegura.soporte.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.soporte.domain.TicketSoporte;

/**
 * Ticket visto por el equipo de soporte (ADMIN, US-25). A diferencia de
 * {@link TicketSoporteResponse} (lo que ve el autor de sus propios tickets),
 * incluye el correo de contacto y el nombre del autor, porque el ADMIN
 * necesita saber a quien responde. Solo lo devuelve un endpoint con
 * {@code hasRole('ADMIN')}.
 *
 * <p>{@code nombreAutor} es {@code null} si el ticket no tiene usuario (el
 * esquema admite tickets de visitante, aunque hoy no se exponen) y
 * {@code respuesta} es {@code null} hasta que soporte responde.</p>
 */
public record TicketAdminResponse(
        Long id,
        String asunto,
        String mensaje,
        String estado,
        String respuesta,
        String emailContacto,
        String nombreAutor,
        Instant createdAt,
        Instant updatedAt
) {
    public static TicketAdminResponse from(TicketSoporte t) {
        Usuario autor = t.getUsuario();
        String nombreAutor = autor == null ? null : autor.getNombre() + " " + autor.getApellido();
        return new TicketAdminResponse(
                t.getId(), t.getAsunto(), t.getMensaje(), t.getEstado().name(), t.getRespuesta(),
                t.getEmailContacto(), nombreAutor, t.getCreatedAt(), t.getUpdatedAt());
    }
}
