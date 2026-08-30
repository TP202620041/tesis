package pe.edu.upc.viasegura.soporte.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.soporte.domain.TicketSoporte;

/**
 * El {@code id} del ticket ES el numero de seguimiento (unico, secuencial,
 * ya lo da la PK) -- no se agrega un codigo aparte.
 */
public record TicketSoporteResponse(
        Long id,
        String asunto,
        String mensaje,
        String estado,
        String respuesta,
        Instant createdAt
) {
    public static TicketSoporteResponse from(TicketSoporte t) {
        return new TicketSoporteResponse(
                t.getId(), t.getAsunto(), t.getMensaje(),
                t.getEstado().name(), t.getRespuesta(), t.getCreatedAt());
    }
}
