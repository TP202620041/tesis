package pe.edu.upc.viasegura.reportes.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.reportes.domain.Calificacion;

/** Acceso a datos de {@link Calificacion} (US-26). */
public interface CalificacionRepository extends JpaRepository<Calificacion, Long> {

    /** Una calificacion por (reporte, ciudadano): base del "una sola vez". */
    boolean existsByReporteIdAndUsuarioId(Long reporteId, Long usuarioId);
}
