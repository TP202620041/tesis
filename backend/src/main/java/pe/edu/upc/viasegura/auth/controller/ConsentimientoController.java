package pe.edu.upc.viasegura.auth.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.dto.AceptarConsentimientoRequest;
import pe.edu.upc.viasegura.auth.dto.ConsentimientoResponse;
import pe.edu.upc.viasegura.auth.dto.ConsentimientosResponse;
import pe.edu.upc.viasegura.auth.service.ConsentimientoService;

/**
 * Consentimientos del propio usuario (D-12). Cualquier rol autenticado: en
 * {@code SecurityConfig} caen en {@code authenticated()} (401 sin token).
 * Solo opera sobre los del usuario del token: no hay ruta con id de usuario,
 * asi que nadie puede leer ni revocar los de otro.
 */
@RestController
@RequestMapping("/api/auth/me/consentimientos")
@RequiredArgsConstructor
public class ConsentimientoController {

    private final ConsentimientoService consentimientoService;

    /** Vigentes, historial y la version de los terminos que se exige hoy. */
    @GetMapping
    public ResponseEntity<ConsentimientosResponse> listar(Principal principal) {
        return ResponseEntity.ok(consentimientoService.listar(principal.getName()));
    }

    /** Acepta una finalidad: 201 si deja fila nueva, 200 si ya estaba vigente con esa version. */
    @PostMapping
    public ResponseEntity<ConsentimientoResponse> aceptar(
            @Valid @RequestBody AceptarConsentimientoRequest request, Principal principal) {
        ConsentimientoService.ResultadoAceptacion resultado =
                consentimientoService.aceptar(principal.getName(), request);
        return ResponseEntity.status(resultado.creado() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(resultado.consentimiento());
    }

    /** Revoca la finalidad (204, idempotente). {@code TERMINOS_Y_PRIVACIDAD} responde 409. */
    @DeleteMapping("/{finalidad}")
    public ResponseEntity<Void> revocar(@PathVariable FinalidadConsentimiento finalidad, Principal principal) {
        consentimientoService.revocar(principal.getName(), finalidad);
        return ResponseEntity.noContent().build();
    }
}
