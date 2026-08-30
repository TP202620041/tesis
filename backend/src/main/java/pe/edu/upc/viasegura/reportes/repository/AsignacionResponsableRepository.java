package pe.edu.upc.viasegura.reportes.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.reportes.domain.AsignacionResponsable;

public interface AsignacionResponsableRepository extends JpaRepository<AsignacionResponsable, Long> {

    /** Asignacion vigente del reporte (a lo sumo una, por el flag activo). */
    Optional<AsignacionResponsable> findByReporteIdAndActivoTrue(Long reporteId);

    /** Historial de asignaciones del reporte, mas reciente primero. */
    List<AsignacionResponsable> findByReporteIdOrderByCreatedAtDesc(Long reporteId);
}
