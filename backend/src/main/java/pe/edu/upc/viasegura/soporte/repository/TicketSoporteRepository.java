package pe.edu.upc.viasegura.soporte.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.soporte.domain.TicketSoporte;

/** Acceso a datos de {@link TicketSoporte} (US-25). */
public interface TicketSoporteRepository extends JpaRepository<TicketSoporte, Long> {

    List<TicketSoporte> findByUsuarioIdOrderByCreatedAtDesc(Long usuarioId);
}
