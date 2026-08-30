package pe.edu.upc.viasegura.reportes.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.reportes.dto.CategoriaDanoResponse;
import pe.edu.upc.viasegura.reportes.dto.CrearCategoriaRequest;
import pe.edu.upc.viasegura.reportes.service.CategoriaDanoService;

/** API de categorias de dano (US-29). */
@RestController
@RequestMapping("/api/categorias")
@RequiredArgsConstructor
public class CategoriaDanoController {

    private final CategoriaDanoService categoriaDanoService;

    /**
     * Catalogo de categorias seleccionables. <b>PUBLICO</b>: es el mismo
     * criterio que la busqueda de reportes (US-10/US-12), que ya es publica
     * y filtra por {@code categoriaId} -- un filtro publico cuyo catalogo
     * exigiera token no tendria sentido. Ademas no expone nada sensible: son
     * datos de referencia, sin PII.
     *
     * <p>{@code distritoId} opcional: sin el, solo las estandar; con el,
     * estandar + personalizadas de ese distrito (US-29). Ver
     * {@link CategoriaDanoService#listarDisponibles} para el porque.</p>
     */
    @GetMapping
    public ResponseEntity<List<CategoriaDanoResponse>> listar(
            @RequestParam(value = "distritoId", required = false) Long distritoId) {
        return ResponseEntity.ok(categoriaDanoService.listarDisponibles(distritoId));
    }

    /** US-29: el funcionario crea una categoria propia de su distrito. */
    @PostMapping
    @PreAuthorize("hasRole('FUNCIONARIO_MUNICIPAL')")
    public ResponseEntity<CategoriaDanoResponse> crear(
            @Valid @RequestBody CrearCategoriaRequest request, Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(categoriaDanoService.crear(principal.getName(), request));
    }
}
