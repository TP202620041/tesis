package pe.edu.upc.viasegura.notificaciones.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.notificaciones.domain.Notificacion;

public interface NotificacionRepository extends JpaRepository<Notificacion, Long> {

    List<Notificacion> findByReporteIdOrderByCreatedAtAsc(Long reporteId);

    List<Notificacion> findByUsuarioIdOrderByCreatedAtDesc(Long usuarioId);
}
