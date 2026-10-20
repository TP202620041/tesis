package pe.edu.upc.viasegura.soporte.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.soporte.domain.EstadoTicket;
import pe.edu.upc.viasegura.soporte.dto.CrearTicketRequest;
import pe.edu.upc.viasegura.soporte.dto.ResponderTicketRequest;
import pe.edu.upc.viasegura.soporte.dto.TicketAdminResponse;
import pe.edu.upc.viasegura.soporte.dto.TicketSoporteResponse;
import pe.edu.upc.viasegura.soporte.service.TicketSoporteService;

/** API de soporte tecnico (US-25). */
@RestController
@RequestMapping("/api/soporte/tickets")
@RequiredArgsConstructor
public class TicketSoporteController {

    private final TicketSoporteService ticketSoporteService;

    /** Cualquier usuario autenticado (rol indiferente) puede contactar soporte. */
    @PostMapping
    public ResponseEntity<TicketSoporteResponse> crear(
            @Valid @RequestBody CrearTicketRequest request, Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ticketSoporteService.crear(principal.getName(), request));
    }

    /** Historial de tickets propios, con estado y respuesta si la hay. */
    @GetMapping("/mis-tickets")
    public ResponseEntity<List<TicketSoporteResponse>> misTickets(Principal principal) {
        return ResponseEntity.ok(ticketSoporteService.misTickets(principal.getName()));
    }

    /**
     * US-25: el equipo de soporte (ADMIN) lista todos los tickets, los mas
     * recientes primero, con filtro opcional por estado. No colisiona con
     * {@code POST} (otro metodo) ni con {@code /mis-tickets} (ruta literal
     * distinta); en {@code SecurityConfig} cae en {@code authenticated()}, asi
     * que sin token es 401 y con otro rol, 403 por el {@code @PreAuthorize}.
     */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<TicketAdminResponse>> listarParaAdmin(
            @RequestParam(value = "estado", required = false) EstadoTicket estado,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "20") int size) {
        return ResponseEntity.ok(ticketSoporteService.listarParaAdmin(estado, page, size));
    }

    /** US-25 Esc.2: el equipo de soporte (ADMIN) responde y avisa por correo. */
    @PatchMapping("/{id}/responder")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<TicketSoporteResponse> responder(
            @PathVariable("id") Long id, @Valid @RequestBody ResponderTicketRequest request) {
        return ResponseEntity.ok(ticketSoporteService.responder(id, request));
    }
}
