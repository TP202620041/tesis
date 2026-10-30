package pe.edu.upc.viasegura.reportes.service;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ContenidoNoPermitidoException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.reportes.domain.AlcanceModeracion;
import pe.edu.upc.viasegura.reportes.domain.EstadoDenuncia;
import pe.edu.upc.viasegura.reportes.domain.HistorialEstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.TipoEventoHistorial;
import pe.edu.upc.viasegura.reportes.dto.DenunciaResponse;
import pe.edu.upc.viasegura.reportes.dto.DesestimarDenunciasRequest;
import pe.edu.upc.viasegura.reportes.dto.ModerarContenidoRequest;
import pe.edu.upc.viasegura.reportes.dto.ReporteModeracionResponse;
import pe.edu.upc.viasegura.reportes.dto.ReporteModeracionResumenResponse;
import pe.edu.upc.viasegura.reportes.event.ReporteVisibilidadCambiadaEvent;
import pe.edu.upc.viasegura.reportes.repository.DenunciaReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.HistorialEstadoReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Moderacion del ADMIN sobre reportes ya publicados (NC-11a, D-15): la bandeja
 * de denuncias, el detalle, la foto aunque este oculta, ocultar y restablecer
 * el reporte o su foto, y desestimar denuncias.
 *
 * <p><b>Solo el ADMIN</b> (las rutas lo exigen; el funcionario y el ciudadano
 * reciben 403). Vive en {@code reportes} y no en {@code moderacion}: si
 * viviera alli, ese modulo usaria {@code reportes} y habria un ciclo
 * (ARCHITECTURE.md §4.3).</p>
 *
 * <p><b>SEC-01.</b> Ocultar el reporte lo saca del indice de desempeno
 * (decision del usuario del 28/10). Lo hace solo el ADMIN, la plataforma, que
 * no se mide; la municipalidad nunca. Cada accion deja un motivo y una entrada
 * en la linea de tiempo, y es reversible. Ocultar o restablecer el reporte
 * publica {@link ReporteVisibilidadCambiadaEvent}, que refresca el indice
 * despues del commit; la foto no mueve el indice y no lo publica.</p>
 *
 * <p><b>El motivo no delata a quien denuncio</b> (terminos v2, §5): lo leen el
 * creador y el funcionario. El servidor nunca le agrega datos de las
 * denuncias, y rechaza con 400 {@code MOTIVO_IDENTIFICA_DENUNCIANTE} un motivo
 * que contenga el correo de un denunciante del reporte. El resto lo cubre el
 * aviso del dialogo del ADMIN en la PWA (NC-11b).</p>
 */
@Service
@RequiredArgsConstructor
public class ModeracionReporteService {

    public static final int MOTIVO_MIN = 10;
    public static final int MOTIVO_MAX = 500;

    private final ReporteRepository reporteRepository;
    private final DenunciaReporteRepository denunciaRepository;
    private final HistorialEstadoReporteRepository historialRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final FotoStorageService fotoStorageService;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Bandeja: reportes con denuncias en {@code estado}, de mas a menos
     * denunciados y, entre iguales, del que espera hace mas.
     */
    @Transactional(readOnly = true)
    public Page<ReporteModeracionResumenResponse> bandeja(EstadoDenuncia estado, Pageable pageable) {
        // El orden lo fija la consulta: se descarta cualquier Sort entrante.
        Pageable soloPaginacion = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        Page<DenunciaReporteRepository.FilaBandeja> filas = denunciaRepository.bandeja(estado, soloPaginacion);
        List<Long> ids = filas.getContent().stream().map(DenunciaReporteRepository.FilaBandeja::getReporteId).toList();
        if (ids.isEmpty()) {
            return filas.map(f -> null);
        }

        Map<Long, Reporte> reportes = reporteRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Reporte::getId, Function.identity()));
        Map<Long, Map<String, Long>> porMotivo = new HashMap<>();
        for (DenunciaReporteRepository.ConteoPorMotivo c : denunciaRepository.conteoPorMotivo(estado, ids)) {
            porMotivo.computeIfAbsent(c.getReporteId(), k -> new LinkedHashMap<>())
                    .put(c.getMotivo().name(), c.getTotal());
        }

        return filas.map(f -> {
            Reporte r = reportes.get(f.getReporteId());
            return new ReporteModeracionResumenResponse(
                    r.getId(),
                    r.getTitulo(),
                    r.getEstado().name(),
                    r.getDistrito() != null ? r.getDistrito().getId() : null,
                    r.getDistrito() != null ? r.getDistrito().getNombre() : null,
                    r.getFotoUrl() != null,
                    r.isOculto(),
                    r.isFotoOculta(),
                    f.getTotal(),
                    porMotivo.getOrDefault(r.getId(), Map.of()),
                    f.getPrimera(),
                    f.getUltima());
        });
    }

    /** Detalle: el reporte en cualquier estado, su moderacion y todas sus denuncias. */
    @Transactional(readOnly = true)
    public ReporteModeracionResponse detalle(Long reporteId) {
        return aResponse(reporte(reporteId));
    }

    /**
     * La foto del reporte aunque este oculta, para que el ADMIN decida. 404 si
     * el reporte no existe, no tiene foto o el archivo ya no esta.
     */
    @Transactional(readOnly = true)
    public Resource foto(Long reporteId) {
        String nombre = FotoStorageService.nombreDeArchivo(reporte(reporteId).getFotoUrl());
        Resource foto = nombre != null ? fotoStorageService.cargarFotoReporte(nombre) : null;
        if (foto == null) {
            throw new ResourceNotFoundException("El reporte no tiene foto: " + reporteId);
        }
        return foto;
    }

    /**
     * Oculta el reporte o su foto, con el motivo en la linea de tiempo, y
     * atiende las denuncias pendientes. 409 si ya estaba oculto con ese
     * alcance o si se pide ocultar la foto de un reporte sin foto.
     */
    @Transactional
    public ReporteModeracionResponse ocultar(String emailAdmin, Long reporteId, ModerarContenidoRequest req) {
        return moderar(emailAdmin, reporteId, req, true);
    }

    /** Restablece el reporte o su foto, con el motivo en la linea de tiempo. 409 si no estaba oculto. */
    @Transactional
    public ReporteModeracionResponse restablecer(String emailAdmin, Long reporteId, ModerarContenidoRequest req) {
        return moderar(emailAdmin, reporteId, req, false);
    }

    /**
     * Desestima las denuncias pendientes del reporte sin ocultar nada. Sin
     * pendientes no cambia nada y responde igual (200): repetirlo es inocuo.
     */
    @Transactional
    public ReporteModeracionResponse desestimar(String emailAdmin, Long reporteId, DesestimarDenunciasRequest req) {
        Usuario admin = usuarioConsultaService.usuarioPorEmail(emailAdmin);
        reporte(reporteId);
        String motivo = req == null || req.motivo() == null || req.motivo().isBlank() ? null : req.motivo().strip();
        denunciaRepository.resolverPendientes(reporteId, EstadoDenuncia.DESESTIMADA.name(),
                admin.getId(), Instant.now(), motivo);
        return detalle(reporteId);
    }

    private ReporteModeracionResponse moderar(String emailAdmin, Long reporteId, ModerarContenidoRequest req,
                                              boolean ocultar) {
        Usuario admin = usuarioConsultaService.usuarioPorEmail(emailAdmin);
        Reporte reporte = reporte(reporteId);
        String motivo = motivoValido(req.motivo(), reporteId);
        AlcanceModeracion alcance = req.alcance();

        if (alcance == AlcanceModeracion.FOTO && reporte.getFotoUrl() == null) {
            throw new BusinessException("El reporte no tiene foto", "SIN_FOTO");
        }
        // UPDATE condicional: si ya estaba asi (o otro ADMIN se adelanto), 0 filas.
        int filas = alcance == AlcanceModeracion.REPORTE
                ? reporteRepository.cambiarOculto(reporteId, ocultar)
                : reporteRepository.cambiarFotoOculta(reporteId, ocultar);
        if (filas == 0) {
            throw ocultar
                    ? new BusinessException(alcance == AlcanceModeracion.REPORTE
                            ? "El reporte ya está oculto" : "La foto ya está oculta", "YA_OCULTO")
                    : new BusinessException(alcance == AlcanceModeracion.REPORTE
                            ? "El reporte no está oculto" : "La foto no está oculta", "NO_OCULTO");
        }

        // El UPDATE limpio el contexto: se relee el reporte con el valor nuevo.
        Reporte actualizado = reporte(reporteId);
        TipoEventoHistorial evento = ocultar ? alcance.eventoAlOcultar() : alcance.eventoAlRestablecer();
        historialRepository.save(HistorialEstadoReporte.builder()
                .reporte(actualizado)
                .tipoEvento(evento)
                .comentario(motivo)
                .autor(admin)
                .build());

        if (ocultar) {
            denunciaRepository.resolverPendientes(reporteId, EstadoDenuncia.ATENDIDA.name(),
                    admin.getId(), Instant.now(), motivo);
        }
        if (alcance.mueveElIndice()) {
            eventPublisher.publishEvent(new ReporteVisibilidadCambiadaEvent(
                    reporteId,
                    actualizado.getDistrito() != null ? actualizado.getDistrito().getId() : null,
                    ocultar));
        }
        return aResponse(actualizado);
    }

    /**
     * El motivo sin espacios al borde, de {@value #MOTIVO_MIN} a
     * {@value #MOTIVO_MAX} caracteres (400), y sin el correo de ningun
     * denunciante del reporte (400 {@code MOTIVO_IDENTIFICA_DENUNCIANTE}).
     */
    private String motivoValido(String motivo, Long reporteId) {
        String limpio = motivo == null ? "" : motivo.strip();
        int largo = limpio.codePointCount(0, limpio.length());
        if (largo < MOTIVO_MIN || largo > MOTIVO_MAX) {
            throw new IllegalArgumentException(
                    "El motivo debe tener entre " + MOTIVO_MIN + " y " + MOTIVO_MAX + " caracteres");
        }
        String comparable = limpio.toLowerCase(Locale.ROOT);
        boolean delata = denunciaRepository.correosDeDenunciantes(reporteId).stream()
                .anyMatch(comparable::contains);
        if (delata) {
            throw new ContenidoNoPermitidoException(
                    "El motivo no puede incluir el correo de quien denunció: lo leerán el autor y la municipalidad",
                    "MOTIVO_IDENTIFICA_DENUNCIANTE", "motivo");
        }
        return limpio;
    }

    private Reporte reporte(Long reporteId) {
        return reporteRepository.findById(reporteId)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));
    }

    private ReporteModeracionResponse aResponse(Reporte reporte) {
        List<DenunciaResponse> denuncias = denunciaRepository.findByReporteIdOrderByCreatedAtAscIdAsc(reporte.getId())
                .stream().map(DenunciaResponse::from).toList();
        return ReporteModeracionResponse.from(reporte, denuncias);
    }
}
