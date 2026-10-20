package pe.edu.upc.viasegura.reportes.service;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * API publica de {@code reportes} para las consultas que necesitan otros
 * modulos ({@code desempeno}, {@code notificaciones}) sin tocar
 * {@link ReporteRepository} (ARCHITECTURE.md 4.3, BE-06). Misma idea que
 * {@code auth.service.UsuarioConsultaService}: metodos de consulta
 * explicitos, no el repositorio entero.
 */
@Service
@RequiredArgsConstructor
public class ReporteConsultaService {

    private final ReporteRepository reporteRepository;

    /**
     * Referencia (proxy sin cargar) al reporte, para guardar una FK hacia el
     * sin leer la fila. No verifica que exista: la usa quien ya conoce el id
     * por un evento del propio modulo {@code reportes}.
     */
    @Transactional(readOnly = true)
    public Reporte referencia(Long reporteId) {
        return reporteRepository.getReferenceById(reporteId);
    }

    /** US-17: reportes en gestion activa del distrito sin responsable vigente. */
    @Transactional(readOnly = true)
    public long contarSinResponsable(Long distritoId) {
        return reporteRepository.countSinResponsable(distritoId);
    }

    /** US-17: reportes no terminales del distrito sin cambios desde {@code limite}. */
    @Transactional(readOnly = true)
    public long contarEstancados(Long distritoId, Instant limite) {
        return reporteRepository.countEstancados(distritoId, limite);
    }
}
