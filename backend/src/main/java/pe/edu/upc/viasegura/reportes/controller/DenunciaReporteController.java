package pe.edu.upc.viasegura.reportes.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.reportes.dto.DenunciaRegistradaResponse;
import pe.edu.upc.viasegura.reportes.dto.DenunciarReporteRequest;
import pe.edu.upc.viasegura.reportes.service.DenunciaReporteService;

/**
 * Denuncias de contenido de los ciudadanos (NC-11a, D-15). Solo el CIUDADANO
 * autenticado y con los terminos aceptados; el funcionario y el ADMIN reciben
 * 403. Las reglas viven en {@link DenunciaReporteService}.
 */
@RestController
@RequestMapping("/api/reportes")
@RequiredArgsConstructor
public class DenunciaReporteController {

    private final DenunciaReporteService denunciaReporteService;

    /**
     * Denuncia un reporte publico. 201; 404 si el reporte no existe, esta
     * cancelado u oculto; 409 si es propio ({@code DENUNCIA_PROPIA}), ya lo
     * denuncio ({@code DENUNCIA_REPETIDA}) o paso el tope diario
     * ({@code LIMITE_DENUNCIAS}); 400 si el motivo no es valido.
     */
    @PostMapping("/{id}/denuncias")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<DenunciaRegistradaResponse> denunciar(
            @PathVariable("id") Long id,
            @Valid @RequestBody DenunciarReporteRequest request,
            Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(denunciaReporteService.denunciar(principal.getName(), id, request));
    }
}
