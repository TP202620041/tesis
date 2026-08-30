package pe.edu.upc.viasegura.reportes.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.dto.AsignacionResponsableResponse;
import pe.edu.upc.viasegura.reportes.dto.AsignarResponsableRequest;
import pe.edu.upc.viasegura.reportes.dto.CambiarEstadoRequest;
import pe.edu.upc.viasegura.reportes.dto.FormatoExportacion;
import pe.edu.upc.viasegura.reportes.dto.ReporteResumenResponse;
import pe.edu.upc.viasegura.reportes.service.ExportarReportesService;
import pe.edu.upc.viasegura.reportes.service.GestionReporteService;

/**
 * API de gestion municipal de reportes (US-13, US-14). Restringida al rol
 * FUNCIONARIO_MUNICIPAL.
 */
@RestController
@RequestMapping("/api/reportes")
@RequiredArgsConstructor
public class GestionReporteController {

    private final GestionReporteService gestionReporteService;
    private final ExportarReportesService exportarReportesService;

    /**
     * US-28: exporta los reportes del distrito del funcionario a CSV/XLSX,
     * con los mismos filtros opcionales de categoria/estado/fechas.
     */
    @GetMapping("/exportar")
    @PreAuthorize("hasRole('FUNCIONARIO_MUNICIPAL')")
    public ResponseEntity<byte[]> exportar(
            @RequestParam(value = "formato", defaultValue = "CSV") FormatoExportacion formato,
            @RequestParam(value = "categoriaId", required = false) Long categoriaId,
            @RequestParam(value = "estado", required = false) EstadoReporte estado,
            @RequestParam(value = "fechaDesde", required = false) Instant fechaDesde,
            @RequestParam(value = "fechaHasta", required = false) Instant fechaHasta,
            Principal principal) {
        var exportacion = exportarReportesService.exportar(
                principal.getName(), formato, categoriaId, estado, fechaDesde, fechaHasta);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(exportacion.tipoContenido()))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(exportacion.nombreArchivo()).build().toString())
                .body(exportacion.contenido());
    }

    /** US-13: bandeja del distrito del funcionario, con filtros opcionales. */
    @GetMapping("/bandeja")
    @PreAuthorize("hasRole('FUNCIONARIO_MUNICIPAL')")
    public ResponseEntity<List<ReporteResumenResponse>> bandeja(
            @RequestParam(value = "estado", required = false) EstadoReporte estado,
            @RequestParam(value = "categoriaId", required = false) Long categoriaId,
            Principal principal) {
        return ResponseEntity.ok(gestionReporteService.bandeja(principal.getName(), estado, categoriaId));
    }

    /** US-14: cambio de estado del reporte (transiciones validadas + auditoria). */
    @PatchMapping("/{id}/estado")
    @PreAuthorize("hasRole('FUNCIONARIO_MUNICIPAL')")
    public ResponseEntity<ReporteResumenResponse> cambiarEstado(
            @PathVariable("id") Long id,
            @Valid @RequestBody CambiarEstadoRequest request,
            Principal principal) {
        return ResponseEntity.ok(gestionReporteService.cambiarEstado(principal.getName(), id, request));
    }

    /** US-15: asigna (o reasigna) un responsable interno al reporte. */
    @PostMapping("/{id}/responsable")
    @PreAuthorize("hasRole('FUNCIONARIO_MUNICIPAL')")
    public ResponseEntity<AsignacionResponsableResponse> asignarResponsable(
            @PathVariable("id") Long id,
            @Valid @RequestBody AsignarResponsableRequest request,
            Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(gestionReporteService.asignarResponsable(principal.getName(), id, request));
    }

    /** US-15: responsable interno vigente del reporte. */
    @GetMapping("/{id}/responsable")
    @PreAuthorize("hasRole('FUNCIONARIO_MUNICIPAL')")
    public ResponseEntity<AsignacionResponsableResponse> responsableActivo(
            @PathVariable("id") Long id,
            Principal principal) {
        return ResponseEntity.ok(gestionReporteService.responsableActivo(principal.getName(), id));
    }
}
