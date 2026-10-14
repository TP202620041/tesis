package pe.edu.upc.viasegura.notificaciones.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.notificaciones.domain.SuscripcionPush;

public interface SuscripcionPushRepository extends JpaRepository<SuscripcionPush, Long> {

    Optional<SuscripcionPush> findByEndpoint(String endpoint);

    /** Solo las del usuario: la de otro se trata como inexistente (404). */
    Optional<SuscripcionPush> findByEndpointAndUsuarioId(String endpoint, Long usuarioId);

    /** Si el canal PUSH puede entregarle algo (ver {@code PushNotificacionAdapter}). */
    boolean existsByUsuarioIdAndActivaTrue(Long usuarioId);
}
