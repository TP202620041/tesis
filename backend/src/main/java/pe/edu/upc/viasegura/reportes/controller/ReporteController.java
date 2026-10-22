package pe.edu.upc.viasegura.reportes.controller;

import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.Principal;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.CacheControl;
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
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.dto.CalificacionResponse;
import pe.edu.upc.viasegura.reportes.dto.CalificarRequest;
import pe.edu.upc.viasegura.reportes.dto.ComentarPublicoRequest;
import pe.edu.upc.viasegura.reportes.dto.ComentarioPublicoResponse;
import pe.edu.upc.viasegura.reportes.dto.DensidadReportesResponse;
import pe.edu.upc.viasegura.reportes.dto.EditarReporteRequest;
import pe.edu.upc.viasegura.reportes.dto.HistorialEntradaResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteResumenResponse;
import pe.edu.upc.viasegura.reportes.service.CalificacionService;
import pe.edu.upc.viasegura.reportes.service.ComentarioPublicoService;
import pe.edu.upc.viasegura.reportes.service.CrearReporteCommand;
import pe.edu.upc.viasegura.reportes.service.DensidadReportesService;
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
    private final DensidadReportesService densidadReportesService;

    /** US-11: vida en cache de la densidad (ver {@link #densidad}). */
    static final long SEGUNDOS_CACHE_DENSIDAD = 60;

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
     * US-11: densidad de reportes para la capa de calor del mapa. <b>PUBLICO</b>
     * (solo GET, ruta exacta en {@code SecurityConfig}), con los mismos filtros
     * que la busqueda (US-12) -- ver {@link DensidadReportesService}.
     *
     * <p><b>Politica de cache</b> (backend/README.md, "Mapa de calor"):
     * {@code Cache-Control: public, max-age=60} y un {@code ETag} del contenido.
     * Un cliente que vuelve a pedir lo mismo dentro del minuto no llega al
     * servidor; despues revalida con {@code If-None-Match} y, si nada cambio,
     * recibe 304 sin cuerpo (lo resuelve Spring MVC al ver el ETag de la
     * respuesta en un GET). {@code public} porque la respuesta no depende de
     * quien consulta, con o sin token.</p>
     */
    @GetMapping("/densidad")
    public ResponseEntity<DensidadReportesResponse> densidad(
            @RequestParam(value = "distritoId", required = false) Long distritoId,
            @RequestParam(value = "categoriaId", required = false) Long categoriaId,
            @RequestParam(value = "estado", required = false) EstadoReporte estado,
            @RequestParam(value = "fechaDesde", required = false) Instant fechaDesde,
            @RequestParam(value = "fechaHasta", required = false) Instant fechaHasta) {
        DensidadReportesResponse densidad = densidadReportesService.densidad(
                distritoId, categoriaId, estado, fechaDesde, fechaHasta);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(SEGUNDOS_CACHE_DENSIDAD)).cachePublic())
                .eTag(etagDe(densidad))
                .body(densidad);
    }

    /**
     * US-05: crear un reporte con foto (opcional), categoria, titulo,
     * descripcion, severidad y coordenadas GPS. El distrito se asigna
     * automaticamente. Titulo y severidad son obligatorios (NC-02): si
     * faltan o no son validos, 400.
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
            // NC-02: obligatorios, pero los valida el servicio despues de la
            // idempotencia (ver ReporteService#crear); por eso required = false.
            @RequestParam(value = "titulo", required = false) String titulo,
            @RequestParam(value = "descripcion", required = false) String descripcion,
            @RequestParam(value = "severidad", required = false) Severidad severidad,
            @RequestParam(value = "ubicacionManual", defaultValue = "false") boolean ubicacionManual,
            @RequestPart(value = "foto", required = false) MultipartFile foto,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            Principal principal) {

        CrearReporteCommand cmd = new CrearReporteCommand(
                latitud, longitud, categoriaId, titulo, descripcion, severidad, ubicacionManual,
                archivoSubido(foto));
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
     * con su estado actual. No incluye reportes donde solo es adherido: esos
     * van en {@code /mis-adhesiones} (QA-1 M-6).
     */
    @GetMapping("/mis-reportes")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<List<ReporteResumenResponse>> misReportes(Principal principal) {
        return ResponseEntity.ok(reporteService.misReportes(principal.getName()));
    }

    /**
     * QA-1 M-6: reportes de otros vecinos a los que el ciudadano se adhirio
     * (US-09), para que pueda seguirlos. Mismo DTO publico que mis-reportes;
     * la relacion ("lo apoyo, no lo cree") la da la ruta, no un campo.
     */
    @GetMapping("/mis-adhesiones")
    @PreAuthorize("hasRole('CIUDADANO')")
    public ResponseEntity<List<ReporteResumenResponse>> misAdhesiones(Principal principal) {
        return ResponseEntity.ok(reporteService.misAdhesiones(principal.getName()));
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
     * lo comparten el mapa publico (anonimo) y las vistas del ciudadano. Ver
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

    /**
     * Convierte la parte multipart en {@link ArchivoSubido} para que el
     * servicio no reciba tipos de Spring Web (BE-10). Sin parte, {@code null};
     * una parte vacia llega como archivo vacio y el servicio la ignora, igual
     * que antes con {@code MultipartFile#isEmpty}.
     */
    private static ArchivoSubido archivoSubido(MultipartFile archivo) {
        if (archivo == null) {
            return null;
        }
        try {
            return new ArchivoSubido(archivo.getBytes(), archivo.getContentType(), archivo.getOriginalFilename());
        } catch (IOException e) {
            throw new BusinessException("No se pudo almacenar la foto");
        }
    }

    /**
     * ETag fuerte: SHA-256 del contenido, truncado a 128 bits (los primeros
     * 16 bytes, en hexadecimal). Los records tienen un
     * {@code toString} determinista (mismos datos, mismo texto), y el
     * servicio redondea las coordenadas para que no haya ruido de coma
     * flotante entre corridas.
     */
    private static String etagDe(DensidadReportesResponse densidad) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(densidad.toString().getBytes(StandardCharsets.UTF_8));
            return "\"" + HexFormat.of().formatHex(hash, 0, 16) + "\"";
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }
}
