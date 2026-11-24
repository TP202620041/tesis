package pe.edu.upc.viasegura.desempeno.controller;

import java.security.Principal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.desempeno.dto.DashboardDistritoResponse;
import pe.edu.upc.viasegura.desempeno.dto.DashboardGestionResponse;
import pe.edu.upc.viasegura.desempeno.dto.DesempenoDistritalResponse;
import pe.edu.upc.viasegura.desempeno.dto.PeriodoGestionResponse;
import pe.edu.upc.viasegura.desempeno.service.DesempenoService;

/**
 * Indice PUBLICO de desempeno distrital (US-18, US-20) y dashboard publico
 * por periodo de gestion (NC-06). Sin autenticacion: es informacion de
 * transparencia ciudadana. Solo {@code /mi-distrito} (US-17) exige rol.
 */
@RestController
@RequestMapping("/api/desempeno")
@RequiredArgsConstructor
public class DesempenoController {

    private final DesempenoService desempenoService;

    /**
     * Ranking de distritos por tasa de resolucion, con tiempo promedio de
     * atencion y satisfaccion. {@code categoriaId} opcional: sin el, agregado
     * general por distrito; con el, desglose de esa categoria (US-20).
     */
    @GetMapping("/distritos")
    public ResponseEntity<List<DesempenoDistritalResponse>> ranking(
            @RequestParam(value = "categoriaId", required = false) Long categoriaId) {
        return ResponseEntity.ok(desempenoService.ranking(categoriaId));
    }

    /**
     * NC-06: periodos de gestion para el filtro del dashboard publico, el
     * mas reciente primero. Publico, solo GET.
     */
    @GetMapping("/periodos")
    public ResponseEntity<List<PeriodoGestionResponse>> periodos() {
        return ResponseEntity.ok(desempenoService.periodos());
    }

    /**
     * NC-06 (OE3-I5): KPIs de cada municipalidad en un periodo de gestion.
     * Publico, solo GET. {@code periodoId} opcional (por defecto el vigente;
     * 404 si no existe o si hoy no hay periodo vigente); {@code categoriaId}
     * opcional, como en {@code /distritos}.
     */
    @GetMapping("/gestion")
    public ResponseEntity<DashboardGestionResponse> gestion(
            @RequestParam(value = "periodoId", required = false) Long periodoId,
            @RequestParam(value = "categoriaId", required = false) Long categoriaId) {
        return ResponseEntity.ok(desempenoService.dashboardGestion(periodoId, categoriaId));
    }

    /**
     * US-17: dashboard interno del funcionario para su propio distrito
     * (mismo resumen que el indice publico + metricas operativas internas).
     */
    @GetMapping("/mi-distrito")
    @PreAuthorize("hasRole('FUNCIONARIO_MUNICIPAL')")
    public ResponseEntity<DashboardDistritoResponse> miDistrito(Principal principal) {
        return ResponseEntity.ok(desempenoService.dashboardDistrito(principal.getName()));
    }
}
