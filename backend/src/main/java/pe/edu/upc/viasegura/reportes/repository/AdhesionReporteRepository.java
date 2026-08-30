package pe.edu.upc.viasegura.reportes.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.reportes.domain.AdhesionReporte;

/** Acceso a datos de {@link AdhesionReporte} (US-09). */
public interface AdhesionReporteRepository extends JpaRepository<AdhesionReporte, Long> {

    boolean existsByReporteIdAndUsuarioId(Long reporteId, Long usuarioId);
}
