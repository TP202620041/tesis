package pe.edu.upc.viasegura.reportes.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.dto.CalificacionResponse;
import pe.edu.upc.viasegura.reportes.dto.CalificarRequest;
import pe.edu.upc.viasegura.reportes.dto.ComentarPublicoRequest;
import pe.edu.upc.viasegura.reportes.dto.ComentarioPublicoResponse;
import pe.edu.upc.viasegura.reportes.dto.EditarReporteRequest;
import pe.edu.upc.viasegura.reportes.dto.HistorialEntradaResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteResumenResponse;
import pe.edu.upc.viasegura.reportes.service.CalificacionService;
import pe.edu.upc.viasegura.reportes.service.ComentarioPublicoService;
import pe.edu.upc.viasegura.reportes.service.CrearReporteCommand;
import pe.edu.upc.viasegura.reportes.service.ReporteBusquedaService;
import pe.edu.upc.viasegura.reportes.service.ReporteService;
import pe.edu.upc.viasegura.reportes.service.SeguimientoReporteService;

/**
 * API de reportes ciudadanos de danos viales.
 */
@RestController
@RequestMapping("/api/reportes")
@RequiredArgsConstructor
public class ReporteController {

    private final ReporteService reporteService;
    private final SeguimientoReporteService seguimientoReporteService;
    private final CalificacionService calificacionService;
    private final ComentarioPublicoService comentarioPublicoService;
    private final ReporteBusquedaService reporteBusquedaService;

    /**
     * US-12/US-10: busqueda publica paginada de reportes. Filtros
     * no-geograficos (distrito/categoria/estado/fechas) para US-12; el area
     * rectangular opcional (minLat/minLon/maxLat/maxLon) sirve al mapa
     * interactivo (US-10) sobre el MISMO endpoint -- ver justificacion en
     * {@link ReporteBusquedaService}. Publico: es la misma informacion (sin
     * identidad del creador) que ya es publica en el mapa/desempeno.
     */
    @GetMapping
    public ResponseEntity<Page<ReporteResumenResponse>> buscar(
            @RequestParam(value = "distritoId", required = false) Long distritoId,
            @RequestParam(value = "categoriaId", required = false) Long categoriaId,
            @RequestParam(value = "estado", required = false) EstadoReporte estado,
            @RequestParam(value = "fechaDesde", required = false) Instant fechaDesde,
            @RequestParam(value = "fechaHasta", required = false) Instant fechaHasta,
            @RequestParam(value = "minLat", required = false) Double minLat,
            @RequestParam(value = "minLon", required = false) Double minLon,
            @RequestParam(value = "maxLat", required = false) Double maxLat,
            @RequestParam(value = "maxLon", required = false) Double maxLon,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(reporteBusquedaService.buscar(
                distritoId, categoriaId, estado, fechaDesde, fechaHasta,
                minLat, minLon, maxLat, maxLon, pageable));
    }

    /**
     * Un reporte por id. <b>PUBLICO</b>: es la misma informacion que ya
     * devuelve la busqueda publica, solo que de a uno, y sin ella no se puede
     * enlazar ni compartir un reporte concreto — algo que US-27 necesita para
     * poder comentar un reporte ajeno.
     *
     * <p>El id se restringe a digitos ({@code [0-9]+}) para no colisionar con
     * las rutas literales hermanas ({@code /mis-reportes}, {@code /bandeja},
     * {@code /exportar}), que NO son publicas.</p>
     */
    @GetMapping("/{id:[0-9]+}")
    public ResponseEntity<ReporteResumenResponse> porId(@PathVariable("id") Long id) {
        return ResponseEntity.ok(reporteBusquedaService.porId(id));
    }

    /**
     * US-05: crear un reporte con foto (opcional), categoria, descripcion y
     * coordenadas GPS. El distrito se asigna automaticamente.
     *
     * <p>Recibe multipart/form-data para permitir la foto junto con los
     * datos. Solo ciudadanos autenticados pueden reportar.</p>
     *
     * <p>US-06: el header opcional {@code Idempotency-Key} permite
     * reintentos seguros de sincronizacion (p.ej. Service Worker offline)
     * sin crear un reporte/adhesion duplicado -- ver
     * {@link pe.edu.upc.viasegura.reportes.service.IdempotencyKeyService}.
     * Es aditivo: si el cliente no lo envia, el comportamiento es
     * exactamente el de antes (compatibilidad hacia atras).</p>
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<ReporteResponse> crear(
            @RequestParam(value = "latitud", required = false) Double latitud,
            @RequestParam(value = "longitud", required = false) Double longitud,
            @RequestParam("categoriaId") Long categoriaId,
            @RequestParam(value = "descripcion", required = false) String descripcion,
            @RequestParam(value = "ubicacionManual", defaultValue = "false") boolean ubicacionManual,
            @RequestPart(value = "foto", required = false) MultipartFile foto,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            Principal principal) {

        CrearReporteCommand cmd = new CrearReporteCommand(
                latitud, longitud, categoriaId, descripcion, ubicacionManual, foto);
        ReporteResponse creado = reporteService.crear(principal.getName(), cmd, idempotencyKey);
        return ResponseEntity.status(HttpStatus.CREATED).body(creado);
    }

    /**
     * US-08: el creador edita categoria y/o descripcion de su reporte
     * mientras sigue PENDIENTE. Estado invalido o no ser el creador -> el
     * servicio lanza 409/403 respectivamente.
     */
    @PatchMapping("/{id}")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<ReporteResumenResponse> editar(
            @PathVariable("id") Long id,
            @Valid @RequestBody EditarReporteRequest request,
            Principal principal) {
        return ResponseEntity.ok(reporteService.editar(principal.getName(), id, request));
    }

    /**
     * US-08: el creador cancela su propio reporte mientras sigue PENDIENTE.
     * Cancela el reporte completo (afecta tambien a los adheridos de US-09):
     * ver justificacion en {@code ReporteService#cancelar}.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<ReporteResumenResponse> cancelar(
            @PathVariable("id") Long id, Principal principal) {
        return ResponseEntity.ok(reporteService.cancelar(principal.getName(), id));
    }

    /**
     * US-07: reportes que el ciudadano autenticado ha enviado (rol CREADOR),
     * con su estado actual. No incluye reportes donde solo es adherido.
     */
    @GetMapping("/mis-reportes")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<List<ReporteResumenResponse>> misReportes(Principal principal) {
        return ResponseEntity.ok(reporteService.misReportes(principal.getName()));
    }

    /**
     * US-22: linea de tiempo de gestion del reporte (cambios de estado +
     * asignaciones). La ve el ciudadano afectado (creador o adherido), el
     * funcionario del distrito y el admin; el detalle interno de las
     * asignaciones se redacta para el ciudadano. La autorizacion vive en el
     * servicio (depende de rol + relacion con el reporte, no solo de rol).
     */
    @GetMapping("/{id}/historial")
    public ResponseEntity<List<HistorialEntradaResponse>> historial(
            @PathVariable("id") Long id, Principal principal) {
        return ResponseEntity.ok(seguimientoReporteService.historial(principal.getName(), id));
    }

    /** US-26: el ciudadano creador califica la atencion de un reporte resuelto. */
    @PostMapping("/{id}/calificacion")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<CalificacionResponse> calificar(
            @PathVariable("id") Long id,
            @Valid @RequestBody CalificarRequest request,
            Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(calificacionService.calificar(principal.getName(), id, request));
    }

    /**
     * US-26: la calificacion que el propio ciudadano dejo en este reporte.
     *
     * <p>404 si todavia no califico — es la senal que usa el frontend para
     * decidir entre mostrar el formulario o la calificacion ya emitida. Va
     * como endpoint propio y no como un campo del resumen del reporte:
     * "ya califique" depende de QUIEN pregunta, y {@code ReporteResumenResponse}
     * lo comparten el mapa publico (anonimo) y la bandeja municipal. Ver
     * {@link CalificacionService#miCalificacion}.</p>
     */
    @GetMapping("/{id}/calificacion")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<CalificacionResponse> miCalificacion(
            @PathVariable("id") Long id, Principal principal) {
        return ResponseEntity.ok(calificacionService.miCalificacion(principal.getName(), id));
    }

    /**
     * US-26 (Esc.2): reportes propios resueltos hace 3+ dias aun sin calificar.
     * Consulta bajo demanda para el aviso no intrusivo de calificacion pendiente.
     */
    @GetMapping("/mis-reportes/pendientes-calificacion")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<List<ReporteResumenResponse>> pendientesDeCalificacion(Principal principal) {
        return ResponseEntity.ok(calificacionService.pendientesDeCalificacion(principal.getName()));
    }

    /** US-27: cualquier ciudadano autenticado comenta un reporte resuelto. */
    @PostMapping("/{id}/comentarios")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<ComentarioPublicoResponse> comentar(
            @PathVariable("id") Long id,
            @Valid @RequestBody ComentarPublicoRequest request,
            Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(comentarioPublicoService.comentar(principal.getName(), id, request));
    }

    /** US-27: comentarios de un reporte. PUBLICO (visible en el mapa). */
    @GetMapping("/{id}/comentarios")
    public ResponseEntity<List<ComentarioPublicoResponse>> comentarios(@PathVariable("id") Long id) {
        return ResponseEntity.ok(comentarioPublicoService.listar(id));
    }
}
