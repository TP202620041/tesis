package pe.edu.upc.viasegura.reportes.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.reportes.domain.EstadoDenuncia;
import pe.edu.upc.viasegura.reportes.dto.DesestimarDenunciasRequest;
import pe.edu.upc.viasegura.reportes.dto.ModerarContenidoRequest;
import pe.edu.upc.viasegura.reportes.dto.ReporteModeracionResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteModeracionResumenResponse;
import pe.edu.upc.viasegura.reportes.service.ModeracionReporteService;

/**
 * Moderacion del ADMIN sobre reportes publicados (NC-11a, D-15). <b>Solo
 * ADMIN</b> en toda la clase: el FUNCIONARIO_MUNICIPAL y el CIUDADANO reciben
 * 403 (SEC-01: la municipalidad nunca oculta). Ninguna ruta es publica.
 *
 * <p>Todas las respuestas llevan {@code Cache-Control: private, no-store}:
 * traen denuncias, con la identidad de quien denuncio, o la foto oculta.</p>
 */
@RestController
@RequestMapping("/api/admin/moderacion/reportes")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class ModeracionReporteController {

    private static final CacheControl SIN_CACHE = CacheControl.noStore().cachePrivate();

    private final ModeracionReporteService moderacionReporteService;

    /** Bandeja: reportes con denuncias en {@code estado} (por defecto PENDIENTE), paginada. */
    @GetMapping
    public ResponseEntity<Page<ReporteModeracionResumenResponse>> bandeja(
            @RequestParam(value = "estado", defaultValue = "PENDIENTE") EstadoDenuncia estado,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok().cacheControl(SIN_CACHE)
                .body(moderacionReporteService.bandeja(estado, pageable));
    }

    /** Detalle del reporte con su estado de moderacion y sus denuncias; 404 si no existe. */
    @GetMapping("/{id}")
    public ResponseEntity<ReporteModeracionResponse> detalle(@PathVariable("id") Long id) {
        return ResponseEntity.ok().cacheControl(SIN_CACHE).body(moderacionReporteService.detalle(id));
    }

    /**
     * La foto aunque este oculta. La PWA la trae con el token y la muestra
     * como {@code blob:}, como la foto de perfil. 404 si no hay foto.
     */
    @GetMapping("/{id}/foto")
    public ResponseEntity<Resource> foto(@PathVariable("id") Long id) {
        Resource foto = moderacionReporteService.foto(id);
        MediaType tipo = MediaTypeFactory.getMediaType(foto).orElse(MediaType.IMAGE_JPEG);
        return ResponseEntity.ok().cacheControl(SIN_CACHE).contentType(tipo).body(foto);
    }

    /** Oculta el reporte o su foto (200); 409 {@code YA_OCULTO} o {@code SIN_FOTO}. */
    @PostMapping("/{id}/ocultamiento")
    public ResponseEntity<ReporteModeracionResponse> ocultar(
            @PathVariable("id") Long id,
            @Valid @RequestBody ModerarContenidoRequest request,
            Principal principal) {
        return ResponseEntity.ok().cacheControl(SIN_CACHE)
                .body(moderacionReporteService.ocultar(principal.getName(), id, request));
    }

    /** Restablece el reporte o su foto (200); 409 {@code NO_OCULTO} o {@code SIN_FOTO}. */
    @PostMapping("/{id}/restablecimiento")
    public ResponseEntity<ReporteModeracionResponse> restablecer(
            @PathVariable("id") Long id,
            @Valid @RequestBody ModerarContenidoRequest request,
            Principal principal) {
        return ResponseEntity.ok().cacheControl(SIN_CACHE)
                .body(moderacionReporteService.restablecer(principal.getName(), id, request));
    }

    /** Desestima las denuncias pendientes sin ocultar nada (200). El cuerpo es opcional. */
    @PostMapping("/{id}/desestimacion")
    public ResponseEntity<ReporteModeracionResponse> desestimar(
            @PathVariable("id") Long id,
            @Valid @RequestBody(required = false) DesestimarDenunciasRequest request,
            Principal principal) {
        return ResponseEntity.ok().cacheControl(SIN_CACHE)
                .body(moderacionReporteService.desestimar(principal.getName(), id, request));
    }
}
