package pe.edu.upc.viasegura.soporte.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.soporte.domain.TicketSoporte;

/**
 * Ticket visto por su autor (US-25).
 *
 * <p>US-25 Esc. 1: {@code numeroSeguimiento} ({@code SOP-000123}) se deriva
 * del {@code id} (unico y secuencial, lo da la PK), y el plazo de atencion
 * llega en horas ({@code plazoRespuestaHoras}) y como fecha
 * ({@code respuestaEsperadaAntesDe}, creacion mas el plazo), para que la PWA
 * lo muestre sin calcularlo.</p>
 */
public record TicketSoporteResponse(
        Long id,
        String numeroSeguimiento,
        String asunto,
        String mensaje,
        String estado,
        String respuesta,
        Instant createdAt,
        long plazoRespuestaHoras,
        Instant respuestaEsperadaAntesDe
) {
    public static TicketSoporteResponse from(TicketSoporte t) {
        return new TicketSoporteResponse(
                t.getId(), t.numeroSeguimiento(), t.getAsunto(), t.getMensaje(),
                t.getEstado().name(), t.getRespuesta(), t.getCreatedAt(),
                TicketSoporte.PLAZO_RESPUESTA.toHours(), t.respuestaEsperadaAntesDe());
    }
}
