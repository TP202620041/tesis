package pe.edu.upc.viasegura.soporte.event;

/**
 * El equipo de soporte (ADMIN) respondio un ticket (US-25, DEP-08). Lo publica
 * {@code TicketSoporteService#responder}; el aviso por correo lo envia
 * {@code TicketRespondidoListener} despues del commit y fuera de la peticion.
 * Solo el id: el texto se lee al enviar.
 */
public record TicketRespondidoEvent(Long ticketId) {}
