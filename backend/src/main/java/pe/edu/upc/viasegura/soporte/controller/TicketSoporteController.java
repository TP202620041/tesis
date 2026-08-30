package pe.edu.upc.viasegura.soporte.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.soporte.dto.CrearTicketRequest;
import pe.edu.upc.viasegura.soporte.dto.ResponderTicketRequest;
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

    /** US-25 Esc.2: el equipo de soporte (ADMIN) responde y avisa por correo. */
    @PatchMapping("/{id}/responder")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<TicketSoporteResponse> responder(
            @PathVariable("id") Long id, @Valid @RequestBody ResponderTicketRequest request) {
        return ResponseEntity.ok(ticketSoporteService.responder(id, request));
    }
}
