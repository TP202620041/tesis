package pe.edu.upc.viasegura.reportes.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.reportes.domain.Calificacion;

/** Acceso a datos de {@link Calificacion} (US-26). */
public interface CalificacionRepository extends JpaRepository<Calificacion, Long> {

    /** Una calificacion por (reporte, ciudadano): base del "una sola vez". */
    boolean existsByReporteIdAndUsuarioId(Long reporteId, Long usuarioId);

    /**
     * La calificacion que dejo un ciudadano concreto en un reporte.
     *
     * <p>El UNIQUE {@code (reporte_id, usuario_id)} garantiza que como mucho
     * hay una, por eso devuelve {@code Optional} y no una lista.</p>
     */
    Optional<Calificacion> findByReporteIdAndUsuarioId(Long reporteId, Long usuarioId);
}
