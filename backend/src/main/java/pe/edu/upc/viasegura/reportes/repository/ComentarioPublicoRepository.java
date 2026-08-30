package pe.edu.upc.viasegura.reportes.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.reportes.domain.ComentarioPublico;

/** Acceso a datos de {@link ComentarioPublico} (US-27). */
public interface ComentarioPublicoRepository extends JpaRepository<ComentarioPublico, Long> {

    List<ComentarioPublico> findByReporteIdOrderByCreatedAtAsc(Long reporteId);
}
