package pe.edu.upc.viasegura.notificaciones.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.notificaciones.dto.BajaSuscripcionPushRequest;
import pe.edu.upc.viasegura.notificaciones.dto.SuscripcionPushRequest;
import pe.edu.upc.viasegura.notificaciones.dto.SuscripcionPushResponse;
import pe.edu.upc.viasegura.notificaciones.service.SuscripcionPushService;

/**
 * Suscripciones Web Push del navegador (NC-07). Cualquier usuario
 * autenticado, sea cual sea su rol: en {@code SecurityConfig} caen en
 * {@code authenticated()}, asi que sin token responden 401.
 */
@RestController
@RequestMapping("/api/notificaciones/suscripciones")
@RequiredArgsConstructor
public class SuscripcionPushController {

    private final SuscripcionPushService suscripcionPushService;

    /** Upsert por endpoint: 201 si es nueva, 200 si ya existia. */
    @PostMapping
    public ResponseEntity<SuscripcionPushResponse> suscribir(
            @Valid @RequestBody SuscripcionPushRequest request, Principal principal) {
        SuscripcionPushService.ResultadoSuscripcion resultado =
                suscripcionPushService.suscribir(principal.getName(), request);
        return ResponseEntity.status(resultado.creada() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(resultado.suscripcion());
    }

    /** Baja de la suscripcion propia de este navegador: 204, o 404 si no es suya. */
    @DeleteMapping
    public ResponseEntity<Void> darDeBaja(
            @Valid @RequestBody BajaSuscripcionPushRequest request, Principal principal) {
        suscripcionPushService.darDeBaja(principal.getName(), request.endpoint());
        return ResponseEntity.noContent().build();
    }
}
