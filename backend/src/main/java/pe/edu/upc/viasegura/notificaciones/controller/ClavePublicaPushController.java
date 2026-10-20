package pe.edu.upc.viasegura.notificaciones.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.notificaciones.dto.ClavePublicaVapidResponse;
import pe.edu.upc.viasegura.notificaciones.service.SuscripcionPushService;

/**
 * Clave publica VAPID (US-21). Publica (ruta exacta y solo GET en
 * {@code SecurityConfig}): el navegador la necesita para suscribirse y no
 * revela nada. 404 si el servidor no tiene claves configuradas.
 */
@RestController
@RequiredArgsConstructor
public class ClavePublicaPushController {

    private final SuscripcionPushService suscripcionPushService;

    @GetMapping("/api/notificaciones/vapid-public-key")
    public ResponseEntity<ClavePublicaVapidResponse> clavePublica() {
        return ResponseEntity.ok(suscripcionPushService.clavePublicaVapid());
    }
}
