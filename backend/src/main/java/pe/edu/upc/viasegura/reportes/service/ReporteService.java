package pe.edu.upc.viasegura.reportes.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.locationtech.jts.geom.Point;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.port.GeoAssignmentStrategy;
import pe.edu.upc.viasegura.municipalidades.service.MunicipalidadService;
import pe.edu.upc.viasegura.reportes.domain.AdhesionReporte;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.HistorialEstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.TipoEventoHistorial;
import pe.edu.upc.viasegura.reportes.dto.EditarReporteRequest;
import pe.edu.upc.viasegura.reportes.dto.ReporteResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteResumenResponse;
import pe.edu.upc.viasegura.reportes.event.ReporteCategoriaCambiadaEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteCreadoEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteEstadoCambiadoEvent;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.HistorialEstadoReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Casos de uso de creacion de reportes (US-05) con acumulacion de
 * duplicados (US-09).
 *
 * <p>Restriccion clave: el distrito se asigna automaticamente segun las
 * coordenadas mediante {@link GeoAssignmentStrategy}. Ademas, si ya existe
 * un reporte activo de la misma categoria a menos de {@value #RADIO_DUPLICADO_METROS}
 * m, el ciudadano se adhiere a el en lugar de duplicar el reporte.</p>
 */
@Service
@RequiredArgsConstructor
public class ReporteService {

    /** Radio de acumulacion de reportes duplicados (US-09). */
    private static final double RADIO_DUPLICADO_METROS = 20.0;

    /** Zona para decidir en que fecha (y periodo de gestion) se creo un reporte. */
    private static final ZoneId ZONA_LIMA = ZoneId.of("America/Lima");

    private final ReporteRepository reporteRepository;
    private final AdhesionReporteRepository adhesionRepository;
    private final CategoriaDanoRepository categoriaRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final GeoAssignmentStrategy geoAssignmentStrategy;
    private final FotoStorageService fotoStorageService;
    private final HistorialEstadoReporteRepository historialRepository;
    private final IdempotencyKeyService idempotencyKeyService;
    private final MunicipalidadService municipalidadService;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * US-06: si el cliente envia {@code Idempotency-Key} y ya existe una
     * respuesta vigente para esa clave+usuario, se devuelve tal cual, sin
     * re-ejecutar nada de lo de abajo (incluida la deduplicacion de
     * US-09) -- ver {@link IdempotencyKeyService}. Sin header (o clave en
     * blanco), el comportamiento es identico al de antes de US-06.
     */
    @Transactional
    public ReporteResponse crear(String emailCreador, CrearReporteCommand cmd, String idempotencyKey) {
        Usuario ciudadano = usuarioConsultaService.usuarioPorEmail(emailCreador);

        String clave = StringUtils.hasText(idempotencyKey) ? idempotencyKey.trim() : null;
        if (clave != null) {
            Optional<ReporteResponse> previa = idempotencyKeyService.respuestaPrevia(clave, ciudadano);
            if (previa.isPresent()) {
                return previa.get();
            }
        }

        validarUbicacion(cmd);
        // NC-02: se valida despues de la idempotencia, para que el reintento de
        // un envio ya procesado reciba su respuesta guardada aunque venga de
        // una version del cliente que no mandaba estos campos.
        String titulo = Reporte.normalizarTitulo(cmd.titulo());
        if (cmd.severidad() == null) {
            throw new IllegalArgumentException("La severidad es obligatoria (BAJA, MEDIA o ALTA)");
        }

        CategoriaDano categoria = categoriaRepository.findById(cmd.categoriaId())
                .orElseThrow(() -> new ResourceNotFoundException("Categoria no encontrada: " + cmd.categoriaId()));
        if (!categoria.isActivo()) {
            throw new BusinessException("La categoria seleccionada no esta activa");
        }

        Point ubicacion = GeometryUtils.point(cmd.longitud(), cmd.latitud());
        // Restriccion clave: asignacion automatica de distrito por coordenadas.
        // Se resuelve ANTES de usar la categoria (US-29): la categoria debe
        // ser valida para el distrito REAL del reporte (point-in-polygon),
        // no para el de residencia del ciudadano ni ningun otro supuesto.
        Distrito distrito = geoAssignmentStrategy.asignarDistrito(ubicacion)
                .orElseThrow(() -> new BusinessException(
                        "La ubicacion esta fuera de la cobertura de Lima Metropolitana"));
        validarCategoriaParaDistrito(categoria, distrito);

        double lon = cmd.longitud();
        double lat = cmd.latitud();

        // US-09: si hay un reporte activo de la misma categoria en el radio,
        // el ciudadano se adhiere en vez de crear un duplicado.
        var cercano = reporteRepository.findReporteActivoCercano(
                lon, lat, categoria.getId(), RADIO_DUPLICADO_METROS);
        ReporteResponse respuesta = cercano.isPresent()
                ? adherir(cercano.get(), ciudadano)
                : crearNuevo(cmd, titulo, ciudadano, categoria, distrito, ubicacion);

        if (clave != null) {
            idempotencyKeyService.registrar(clave, ciudadano, respuesta);
        }
        return respuesta;
    }

    private ReporteResponse crearNuevo(CrearReporteCommand cmd, String titulo, Usuario ciudadano,
                                        CategoriaDano categoria, Distrito distrito, Point ubicacion) {
        String fotoUrl = null;
        ArchivoSubido foto = cmd.foto();
        if (foto != null && !foto.vacio()) {
            fotoUrl = fotoStorageService.almacenarFotoReporte(foto);
        }

        Reporte reporte = reporteRepository.save(Reporte.builder()
                .ubicacion(ubicacion)
                .fotoUrl(fotoUrl)
                .titulo(titulo)
                .descripcion(cmd.descripcion())
                .severidad(cmd.severidad())
                .categoria(categoria)
                .estado(EstadoReporte.PENDIENTE)
                .distrito(distrito)
                .creador(ciudadano)
                .totalAdhesiones(1)
                .build());

        // NC-02: el periodo de gestion de su fecha de creacion (hora de Lima,
        // la misma conversion que usa V17 para los reportes existentes).
        reporte.setPeriodoGestion(municipalidadService
                .periodoVigente(LocalDate.ofInstant(reporte.getCreatedAt(), ZONA_LIMA))
                .orElse(null));

        // El creador tambien es un ciudadano afectado: adhesion_reporte es la
        // fuente unica de "afectados" y totalAdhesiones refleja su conteo.
        adhesionRepository.save(AdhesionReporte.builder()
                .reporte(reporte)
                .usuario(ciudadano)
                .build());

        // Un reporte nuevo suma al denominador de la tasa de resolucion
        // (US-18/US-20). Se publica solo aqui y no en adherir(): una adhesion
        // no crea fila en `reporte`, asi que no mueve ninguna metrica.
        eventPublisher.publishEvent(new ReporteCreadoEvent(
                reporte.getId(), distrito.getId(), categoria.getId()));

        return ReporteResponse.from(reporte, false);
    }

    private ReporteResponse adherir(Reporte existente, Usuario ciudadano) {
        if (adhesionRepository.existsByReporteIdAndUsuarioId(existente.getId(), ciudadano.getId())) {
            throw new BusinessException("Ya reportaste este dano");
        }

        adhesionRepository.save(AdhesionReporte.builder()
                .reporte(existente)
                .usuario(ciudadano)
                .build());
        existente.setTotalAdhesiones(existente.getTotalAdhesiones() + 1);

        return ReporteResponse.from(reporteRepository.save(existente), true);
    }

    /**
     * US-07: reportes que el propio ciudadano envio (rol CREADOR), mas
     * recientes primero. Escenario 2 (sin reportes): lista vacia -- el
     * mensaje "Aun no has enviado..." es responsabilidad del frontend, no
     * del backend.
     */
    @Transactional(readOnly = true)
    public List<ReporteResumenResponse> misReportes(String emailCiudadano) {
        Usuario ciudadano = usuarioConsultaService.usuarioPorEmail(emailCiudadano);
        return reporteRepository.findByCreadorIdOrderByCreatedAtDesc(ciudadano.getId()).stream()
                .map(ReporteResumenResponse::from)
                .toList();
    }

    /**
     * US-08: el creador edita categoria, titulo, descripcion y/o severidad
     * mientras el reporte sigue PENDIENTE (antes de que la municipalidad lo
     * reciba). Campos {@code null} en el request no se modifican.
     */
    @Transactional
    public ReporteResumenResponse editar(String emailCiudadano, Long reporteId, EditarReporteRequest req) {
        Reporte reporte = reportePendienteDelCreador(emailCiudadano, reporteId);

        Long categoriaAnterior = reporte.getCategoria() != null ? reporte.getCategoria().getId() : null;

        // US-29: solo se valida (activa y del distrito) al CAMBIAR de categoria.
        // Reenviar la actual no la cambia: si se desactivo despues de crear el
        // reporte, el creador debe poder seguir editando la descripcion.
        if (req.categoriaId() != null && !req.categoriaId().equals(categoriaAnterior)) {
            CategoriaDano categoria = categoriaRepository.findById(req.categoriaId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Categoria no encontrada: " + req.categoriaId()));
            if (!categoria.isActivo()) {
                throw new BusinessException("La categoria seleccionada no esta activa");
            }
            // US-29: mismo criterio que al crear -- no se puede cambiar a una
            // categoria personalizada de otro distrito distinto al del reporte.
            validarCategoriaParaDistrito(categoria, reporte.getDistrito());
            reporte.setCategoria(categoria);
        }
        if (req.titulo() != null) {
            reporte.setTitulo(Reporte.normalizarTitulo(req.titulo()));
        }
        if (req.descripcion() != null) {
            reporte.setDescripcion(req.descripcion());
        }
        if (req.severidad() != null) {
            reporte.setSeveridad(req.severidad());
        }

        Reporte guardado = reporteRepository.save(reporte);

        // El desglose por categoria de US-20 agrupa por (distrito, categoria):
        // mover el reporte de una a otra resta en una fila y suma en la otra.
        // Solo si cambio de verdad -- reenviar la misma categoria no mueve nada.
        Long categoriaNueva = guardado.getCategoria() != null ? guardado.getCategoria().getId() : null;
        if (!Objects.equals(categoriaAnterior, categoriaNueva)) {
            eventPublisher.publishEvent(new ReporteCategoriaCambiadaEvent(
                    guardado.getId(),
                    guardado.getDistrito() != null ? guardado.getDistrito().getId() : null,
                    categoriaAnterior,
                    categoriaNueva));
        }

        return ReporteResumenResponse.from(guardado);
    }

    /**
     * US-08: el creador cancela su propio reporte mientras sigue PENDIENTE.
     *
     * <p>Decision: cancela el reporte para todos los afectados (incluidos
     * los adheridos de US-09), no solo "desvincula" al creador. El estado
     * vive en una sola fila {@link Reporte} -- no hay un modelo de
     * co-titularidad donde cada adherido pueda mantener "su" copia activa,
     * porque es un unico dano fisico. Es aceptable porque solo aplica en
     * PENDIENTE (la municipalidad aun no empezo a gestionarlo, no se pierde
     * trabajo), y un adherido para quien el dano sigue siendo real puede
     * volver a reportarlo: al quedar CANCELADO deja de ser "activo" para la
     * deteccion de duplicados (US-09), asi que un reporte nuevo no se
     * adhiere a este sino que abre uno propio.</p>
     */
    @Transactional
    public ReporteResumenResponse cancelar(String emailCiudadano, Long reporteId) {
        Reporte reporte = reportePendienteDelCreador(emailCiudadano, reporteId);

        // Redundante con la comprobacion de PENDIENTE que ya hizo
        // reportePendienteDelCreador, pero deja el invariante escrito en el
        // dominio: esta es la UNICA via legitima a CANCELADO, y la maquina
        // de estados lo dice (ver EstadoReporte). El endpoint de gestion
        // municipal no puede llegar aqui.
        if (!reporte.getEstado().elCreadorPuedeCancelar()) {
            throw new BusinessException(
                    "Solo se puede cancelar un reporte en estado PENDIENTE (actual: "
                            + reporte.getEstado() + ")");
        }

        reporte.setEstado(EstadoReporte.CANCELADO);
        Reporte guardado = reporteRepository.save(reporte);

        historialRepository.save(HistorialEstadoReporte.builder()
                .reporte(guardado)
                .tipoEvento(TipoEventoHistorial.CAMBIO_ESTADO)
                .estadoAnterior(EstadoReporte.PENDIENTE)
                .estadoNuevo(EstadoReporte.CANCELADO)
                .comentario("Cancelado por el ciudadano creador.")
                .autor(guardado.getCreador())
                .build());

        // Cancelar SACA el reporte del indice: la vista materializada excluye
        // los CANCELADO de total_reportes (migracion V7), asi que sin este
        // evento el reporte retirado seguia contando hasta un refresh ajeno.
        // Se reutiliza el evento de cambio de estado en vez de crear uno
        // propio porque cancelar ES un cambio de estado; las notificaciones
        // ya lo ignoran a proposito (NotificacionService no notifica al
        // ciudadano de su propia accion).
        Distrito distritoCancelado = guardado.getDistrito();
        eventPublisher.publishEvent(new ReporteEstadoCambiadoEvent(
                guardado.getId(),
                guardado.getCreador() != null ? guardado.getCreador().getId() : null,
                distritoCancelado != null ? distritoCancelado.getId() : null,
                distritoCancelado != null ? distritoCancelado.getNombre() : null,
                EstadoReporte.PENDIENTE,
                EstadoReporte.CANCELADO,
                "Cancelado por el ciudadano creador."));

        return ReporteResumenResponse.from(guardado);
    }

    private Reporte reportePendienteDelCreador(String emailCiudadano, Long reporteId) {
        Usuario ciudadano = usuarioConsultaService.usuarioPorEmail(emailCiudadano);
        Reporte reporte = reporteRepository.findById(reporteId)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));

        if (reporte.getCreador() == null || !reporte.getCreador().getId().equals(ciudadano.getId())) {
            throw new AccessDeniedException("Solo el creador del reporte puede editarlo o cancelarlo");
        }
        if (reporte.getEstado() != EstadoReporte.PENDIENTE) {
            throw new BusinessException(
                    "Solo se puede editar o cancelar un reporte en estado PENDIENTE (actual: "
                            + reporte.getEstado() + ")");
        }
        return reporte;
    }

    /**
     * US-29: una categoria estandar (global) siempre es valida; una
     * personalizada solo lo es para el distrito al que pertenece.
     */
    private void validarCategoriaParaDistrito(CategoriaDano categoria, Distrito distrito) {
        if (categoria.isEsEstandar()) {
            return;
        }
        if (categoria.getDistrito() == null || !categoria.getDistrito().getId().equals(distrito.getId())) {
            throw new BusinessException(
                    "La categoria '" + categoria.getNombre() + "' no esta disponible en " + distrito.getNombre());
        }
    }

    /**
     * US-05, Escenario 2: si el GPS no esta disponible, el ciudadano debe
     * ingresar la ubicacion manualmente; en ambos casos las coordenadas son
     * obligatorias y deben ser validas.
     */
    private void validarUbicacion(CrearReporteCommand cmd) {
        if (cmd.latitud() == null || cmd.longitud() == null) {
            throw new IllegalArgumentException(
                    "Ubicacion requerida: active el GPS o ingrese la ubicacion manualmente");
        }
        double lat = cmd.latitud();
        double lon = cmd.longitud();
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            throw new IllegalArgumentException("Coordenadas fuera de rango");
        }
    }
}
