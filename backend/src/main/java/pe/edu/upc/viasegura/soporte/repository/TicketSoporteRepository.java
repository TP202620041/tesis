package pe.edu.upc.viasegura.soporte.repository;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.soporte.domain.EstadoTicket;
import pe.edu.upc.viasegura.soporte.domain.TicketSoporte;

/** Acceso a datos de {@link TicketSoporte} (US-25). */
public interface TicketSoporteRepository extends JpaRepository<TicketSoporte, Long> {

    List<TicketSoporte> findByUsuarioIdOrderByCreatedAtDesc(Long usuarioId);

    /**
     * Listado del ADMIN sin filtro. Es una consulta derivada separada de
     * {@link #findByEstado} en vez de un JPQL con {@code (:estado IS NULL OR ...)}
     * (trampa de Postgres documentada en {@code backend/CLAUDE.md}); el
     * servicio elige cual usar. El autor se trae en la misma consulta porque
     * la respuesta del ADMIN muestra su nombre.
     */
    @EntityGraph(attributePaths = "usuario")
    Page<TicketSoporte> findAllBy(Pageable pageable);

    /** Listado del ADMIN filtrado por estado (US-25). */
    @EntityGraph(attributePaths = "usuario")
    Page<TicketSoporte> findByEstado(EstadoTicket estado, Pageable pageable);
}
