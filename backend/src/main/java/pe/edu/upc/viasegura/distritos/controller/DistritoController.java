package pe.edu.upc.viasegura.distritos.controller;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.distritos.dto.DistritoResponse;
import pe.edu.upc.viasegura.distritos.service.DistritoService;

/**
 * Catalogo PUBLICO de distritos: dato de referencia para poblar selectores
 * y filtros (crear reporte US-05, mapa US-10, busqueda US-12).
 *
 * <p><b>Por que existe si {@code GET /api/desempeno/distritos} ya devuelve
 * los 43.</b> No es duplicacion: son dos cosas distintas que coinciden en el
 * nombre.</p>
 * <ul>
 *   <li><b>Orden:</b> el de desempeno viene ordenado por tasa de resolucion
 *       DESC (es un ranking, US-18); un selector necesita orden alfabetico.</li>
 *   <li><b>Origen:</b> aquel lee la vista materializada
 *       {@code mv_indice_desempeno_distrital}, refrescada por eventos. Atar
 *       el formulario de crear reporte -- la pantalla mas critica -- al
 *       estado de refresco de una MV de metricas seria un acoplamiento
 *       fragil; este lee la tabla {@code distrito} directamente.</li>
 *   <li><b>Payload:</b> aquel trae tasa, tiempo promedio, satisfaccion y
 *       totales por distrito; para un {@code <select>} basta id + nombre.</li>
 * </ul>
 * <p>Es decir: uno es <em>catalogo de referencia</em>, el otro es
 * <em>reporte de transparencia</em>. Comparten datos, no proposito.</p>
 */
@RestController
@RequestMapping("/api/distritos")
@RequiredArgsConstructor
public class DistritoController {

    private final DistritoService distritoService;

    /** Los 43 distritos de Lima Metropolitana, en orden alfabetico. */
    @GetMapping
    public ResponseEntity<List<DistritoResponse>> listar() {
        return ResponseEntity.ok(distritoService.listar());
    }

    /**
     * Distrito que contiene un punto GPS (US-05).
     *
     * <p>No permite al ciudadano ELEGIR distrito — sigue siendo el servidor
     * quien lo determina por coordenadas. Le permite al cliente saberlo
     * antes de enviar el reporte, para ofrecer las categorias personalizadas
     * correctas (US-29) y mostrar a que municipalidad ira.</p>
     *
     * <p>404 si el punto cae fuera de la cobertura de Lima Metropolitana:
     * "el distrito que contiene este punto" no existe. Permite avisarlo en
     * el formulario en vez de esperar al 409 del POST.</p>
     */
    @GetMapping("/por-coordenadas")
    public ResponseEntity<DistritoResponse> porCoordenadas(
            @RequestParam("lat") double lat,
            @RequestParam("lon") double lon) {
        return distritoService.porCoordenadas(lat, lon)
                .map(ResponseEntity::ok)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "La ubicación está fuera de la cobertura de Lima Metropolitana"));
    }
}
