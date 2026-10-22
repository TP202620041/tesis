package pe.edu.upc.viasegura.soporte.service;

import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;
import pe.edu.upc.viasegura.soporte.domain.EstadoTicket;
import pe.edu.upc.viasegura.soporte.domain.TicketSoporte;
import pe.edu.upc.viasegura.soporte.dto.CrearTicketRequest;
import pe.edu.upc.viasegura.soporte.dto.ResponderTicketRequest;
import pe.edu.upc.viasegura.soporte.dto.TicketAdminResponse;
import pe.edu.upc.viasegura.soporte.dto.TicketSoporteResponse;
import pe.edu.upc.viasegura.soporte.event.TicketRespondidoEvent;
import pe.edu.upc.viasegura.soporte.repository.TicketSoporteRepository;

/**
 * Consultas de soporte tecnico (US-25).
 *
 * <p>Alcance de esta implementacion: creacion y consulta por el usuario
 * AUTENTICADO (el ticket de visitante anonimo que ya admite el esquema
 * -- {@code usuario} nullable -- no se expone en esta fase porque no fue
 * pedido). La respuesta del equipo de soporte (Esc.2 del backlog: "responde
 * por correo") sale por el puerto {@code CorreoSaliente}, como la
 * recuperacion de contrasena (US-03) y con el mismo criterio: es un correo
 * puntual fuera del dominio de notificaciones de reportes, no pasa por
 * {@code NotificacionService}. A diferencia de US-03, aqui la respuesta SI
 * se persiste (no solo se envia): el ciudadano debe poder verla via
 * {@code GET /mis-tickets}, no solo en su bandeja de email.</p>
 *
 * <p><b>El correo sale despues del commit</b> (DEP-08, patron de D-13):
 * {@link #responder} guarda y publica {@link TicketRespondidoEvent}, y
 * {@code TicketRespondidoListener} envia {@link #mensajeDeRespuesta} fuera de
 * la peticion. Un proveedor caido ya no revierte la respuesta ni da 500.</p>
 */
@Service
@RequiredArgsConstructor
public class TicketSoporteService {

    private final TicketSoporteRepository ticketRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final ApplicationEventPublisher eventPublisher;

    /** Tope del {@code size} del listado del ADMIN (US-25). */
    static final int TAMANO_MAXIMO_PAGINA = 100;

    static final String ETIQUETA = "soporte";

    @Transactional
    public TicketSoporteResponse crear(String email, CrearTicketRequest req) {
        Usuario usuario = usuarioConsultaService.usuarioPorEmail(email);

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
        Usuario usuario = usuarioConsultaService.usuarioPorEmail(email);
        return ticketRepository.findByUsuarioIdOrderByCreatedAtDesc(usuario.getId()).stream()
                .map(TicketSoporteResponse::from)
                .toList();
    }

    /**
     * US-25: bandeja del equipo de soporte (ADMIN), los mas recientes primero.
     * El orden es fijo (con {@code id} como desempate, para que la paginacion
     * sea estable) y {@code estado} {@code null} significa "todos": se combinan
     * dos consultas derivadas en vez de un filtro opcional en JPQL.
     */
    @Transactional(readOnly = true)
    public Page<TicketAdminResponse> listarParaAdmin(EstadoTicket estado, int page, int size) {
        if (page < 0) {
            throw new IllegalArgumentException("page debe ser mayor o igual a 0");
        }
        if (size < 1 || size > TAMANO_MAXIMO_PAGINA) {
            throw new IllegalArgumentException("size debe estar entre 1 y " + TAMANO_MAXIMO_PAGINA);
        }
        PageRequest pagina = PageRequest.of(page, size,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        Page<TicketSoporte> tickets = estado == null
                ? ticketRepository.findAllBy(pagina)
                : ticketRepository.findByEstado(estado, pagina);
        return tickets.map(TicketAdminResponse::from);
    }

    /**
     * ADMIN responde el ticket: se persiste la respuesta y, despues del
     * commit, se avisa por correo ({@link TicketRespondidoEvent}).
     */
    @Transactional
    public TicketSoporteResponse responder(Long ticketId, ResponderTicketRequest req) {
        TicketSoporte ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new ResourceNotFoundException("Ticket no encontrado: " + ticketId));

        ticket.setRespuesta(req.respuesta());
        ticket.setEstado(req.estado());
        TicketSoporte guardado = ticketRepository.save(ticket);

        eventPublisher.publishEvent(new TicketRespondidoEvent(guardado.getId()));

        return TicketSoporteResponse.from(guardado);
    }

    /**
     * El correo con la respuesta del ticket, listo para enviar, o vacio si no
     * hay nada que avisar (el ticket no existe, no tiene respuesta o no tiene
     * correo de contacto). Solo lectura y corto: lo llama
     * {@code TicketRespondidoListener} antes de enviar, fuera de esta
     * transaccion. Se lee la respuesta vigente al enviar, no la del evento.
     */
    @Transactional(readOnly = true)
    public Optional<MensajeCorreo> mensajeDeRespuesta(Long ticketId) {
        return ticketRepository.findById(ticketId)
                .filter(t -> StringUtils.hasText(t.getEmailContacto()) && StringUtils.hasText(t.getRespuesta()))
                .map(t -> new MensajeCorreo(t.getEmailContacto(),
                        "Ciudad Viva: respuesta a tu consulta \"%s\"".formatted(t.getAsunto()),
                        t.getRespuesta(), ETIQUETA));
    }
}
