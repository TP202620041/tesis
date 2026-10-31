package pe.edu.upc.viasegura.reportes.service;

import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.reportes.domain.DenunciaReporte;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.dto.DenunciaRegistradaResponse;
import pe.edu.upc.viasegura.reportes.dto.DenunciarReporteRequest;
import pe.edu.upc.viasegura.reportes.repository.DenunciaReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Denuncias de los ciudadanos sobre reportes publicos (NC-11a, D-15).
 *
 * <p>Una denuncia <b>no oculta nada</b>: solo pone el reporte en la bandeja del
 * ADMIN ({@link ModeracionReporteService}). Con un ocultamiento automatico,
 * quien juntara cuentas podria sacar un reporte del mapa y, desde la decision
 * del 28/10, tambien del indice de desempeno (SEC-01).</p>
 *
 * <p>Reglas: solo un CIUDADANO (la ruta lo exige), sobre un reporte publico
 * (404 si no existe, esta CANCELADO u oculto), nunca el propio (409
 * {@code DENUNCIA_PROPIA}), una vez por reporte (409 {@code DENUNCIA_REPETIDA})
 * y como maximo {@code app.moderacion.denuncias-por-dia} en las ultimas 24 h
 * (409 {@code LIMITE_DENUNCIAS}). El tope es una ventana movil de 24 h, no el
 * dia calendario: no se reinicia de golpe a medianoche.</p>
 */
@Service
public class DenunciaReporteService {

    /** Ventana del tope de denuncias por ciudadano. */
    static final Duration VENTANA_TOPE = Duration.ofHours(24);

    private final ReporteRepository reporteRepository;
    private final DenunciaReporteRepository denunciaRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final int denunciasPorDia;

    public DenunciaReporteService(
            ReporteRepository reporteRepository,
            DenunciaReporteRepository denunciaRepository,
            UsuarioConsultaService usuarioConsultaService,
            @Value("${app.moderacion.denuncias-por-dia:10}") int denunciasPorDia) {
        this.reporteRepository = reporteRepository;
        this.denunciaRepository = denunciaRepository;
        this.usuarioConsultaService = usuarioConsultaService;
        if (denunciasPorDia < 1) {
            throw new IllegalStateException("app.moderacion.denuncias-por-dia debe ser al menos 1");
        }
        this.denunciasPorDia = denunciasPorDia;
    }

    /** Registra la denuncia del ciudadano sobre un reporte publico. */
    @Transactional
    public DenunciaRegistradaResponse denunciar(String emailCiudadano, Long reporteId, DenunciarReporteRequest req) {
        Usuario ciudadano = usuarioConsultaService.usuarioPorEmail(emailCiudadano);
        Reporte reporte = reporteRepository.findById(reporteId)
                .filter(r -> !r.isOculto() && r.getEstado() != EstadoReporte.CANCELADO)
                .orElseThrow(() -> new ResourceNotFoundException("Reporte no encontrado: " + reporteId));

        if (reporte.getCreador() != null && reporte.getCreador().getId().equals(ciudadano.getId())) {
            throw new BusinessException("No puedes denunciar tu propio reporte", "DENUNCIA_PROPIA");
        }
        if (denunciaRepository.existsByReporteIdAndDenuncianteId(reporteId, ciudadano.getId())) {
            throw repetida();
        }
        Instant desde = Instant.now().minus(VENTANA_TOPE);
        if (denunciaRepository.countByDenuncianteIdAndCreatedAtAfter(ciudadano.getId(), desde) >= denunciasPorDia) {
            throw new BusinessException("Alcanzaste el máximo de denuncias por hoy", "LIMITE_DENUNCIAS");
        }

        String detalle = req.detalle() == null || req.detalle().isBlank() ? null : req.detalle().strip();
        try {
            DenunciaReporte denuncia = denunciaRepository.saveAndFlush(DenunciaReporte.builder()
                    .reporte(reporte)
                    .denunciante(ciudadano)
                    .motivo(req.motivo())
                    .detalle(detalle)
                    .build());
            return DenunciaRegistradaResponse.from(denuncia);
        } catch (DataIntegrityViolationException e) {
            // Dos envios simultaneos del mismo ciudadano: el UNIQUE de V21 deja
            // pasar uno, y el otro recibe el mismo 409 que una repeticion.
            throw repetida();
        }
    }

    private static BusinessException repetida() {
        return new BusinessException("Ya denunciaste este reporte", "DENUNCIA_REPETIDA");
    }
}
