package pe.edu.upc.viasegura.reportes.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.reportes.domain.HistorialEstadoReporte;

/** Acceso a datos del historial de estados (auditoria, US-14, US-22). */
public interface HistorialEstadoReporteRepository extends JpaRepository<HistorialEstadoReporte, Long> {

    List<HistorialEstadoReporte> findByReporteIdOrderByCreatedAtAsc(Long reporteId);

    /**
     * Linea de tiempo del reporte (US-22). El desempate por id garantiza un
     * orden cronologico estable aun cuando dos eventos compartan timestamp.
     */
    List<HistorialEstadoReporte> findByReporteIdOrderByCreatedAtAscIdAsc(Long reporteId);
}
