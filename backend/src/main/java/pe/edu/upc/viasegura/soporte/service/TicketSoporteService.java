package pe.edu.upc.viasegura.soporte.service;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.soporte.domain.TicketSoporte;
import pe.edu.upc.viasegura.soporte.dto.CrearTicketRequest;
import pe.edu.upc.viasegura.soporte.dto.ResponderTicketRequest;
import pe.edu.upc.viasegura.soporte.dto.TicketSoporteResponse;
import pe.edu.upc.viasegura.soporte.repository.TicketSoporteRepository;

/**
 * Consultas de soporte tecnico (US-25).
 *
 * <p>Alcance de esta implementacion: creacion y consulta por el usuario
 * AUTENTICADO (el ticket de visitante anonimo que ya admite el esquema
 * -- {@code usuario} nullable -- no se expone en esta fase porque no fue
 * pedido). La respuesta del equipo de soporte (Esc.2 del backlog: "responde
 * por correo") reutiliza el mismo bean {@code JavaMailSender} que US-03
 * (recuperacion de password), con el mismo criterio: es un correo puntual
 * fuera del dominio de notificaciones de reportes, no pasa por
 * {@code NotificacionService}. A diferencia de US-03, aqui la respuesta SI
 * se persiste (no solo se envia): el ciudadano debe poder verla via
 * {@code GET /mis-tickets}, no solo en su bandeja de email.</p>
 */
@Service
@RequiredArgsConstructor
public class TicketSoporteService {

    private final TicketSoporteRepository ticketRepository;
    private final UsuarioRepository usuarioRepository;
    private final JavaMailSender mailSender;

    @Value("${app.notificaciones.email-remitente:no-reply@viasegura.pe}")
    private String remitente;

    @Transactional
    public TicketSoporteResponse crear(String email, CrearTicketRequest req) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        TicketSoporte ticket = ticketRepository.save(TicketSoporte.builder()
                .usuario(usuario)
                .emailContacto(usuario.getEmail())
                .asunto(req.asunto())
                .mensaje(req.mensaje())
                .build());

        return TicketSoporteResponse.from(ticket);
    }

    @Transactional(readOnly = true)
    public List<TicketSoporteResponse> misTickets(String email) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        return ticketRepository.findByUsuarioIdOrderByCreatedAtDesc(usuario.getId()).stream()
                .map(TicketSoporteResponse::from)
                .toList();
    }

    /** ADMIN responde el ticket: se persiste la respuesta y se avisa por correo. */
    @Transactional
    public TicketSoporteResponse responder(Long ticketId, ResponderTicketRequest req) {
        TicketSoporte ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket no encontrado: " + ticketId));

        ticket.setRespuesta(req.respuesta());
        ticket.setEstado(req.estado());
        TicketSoporte guardado = ticketRepository.save(ticket);

        enviarRespuestaPorCorreo(guardado);

        return TicketSoporteResponse.from(guardado);
    }

    private void enviarRespuestaPorCorreo(TicketSoporte ticket) {
        SimpleMailMessage correo = new SimpleMailMessage();
        correo.setFrom(remitente);
        correo.setTo(ticket.getEmailContacto());
        correo.setSubject("ViaSegura: respuesta a tu consulta \"%s\"".formatted(ticket.getAsunto()));
        correo.setText(ticket.getRespuesta());
        mailSender.send(correo);
    }
}
