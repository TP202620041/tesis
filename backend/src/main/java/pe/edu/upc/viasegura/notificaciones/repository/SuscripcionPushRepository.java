package pe.edu.upc.viasegura.notificaciones.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.notificaciones.domain.SuscripcionPush;

public interface SuscripcionPushRepository extends JpaRepository<SuscripcionPush, Long> {

    Optional<SuscripcionPush> findByEndpoint(String endpoint);

    /** Solo las del usuario: la de otro se trata como inexistente (404). */
    Optional<SuscripcionPush> findByEndpointAndUsuarioId(String endpoint, Long usuarioId);

    /** Si el canal PUSH puede entregarle algo (ver {@code PushNotificacionAdapter}). */
    boolean existsByUsuarioIdAndActivaTrue(Long usuarioId);

    /** Las activas del usuario: a todas se les envia el aviso (US-21). */
    List<SuscripcionPush> findByUsuarioIdAndActivaTrue(Long usuarioId);

    /** Las del usuario, de la registrada mas recientemente a la mas antigua (tope por usuario). */
    List<SuscripcionPush> findByUsuarioIdOrderByUpdatedAtDescIdDesc(Long usuarioId);

    /**
     * Borra todas las suscripciones del usuario (al revocar el consentimiento
     * {@code NOTIFICACIONES_PUSH}, D-12). Devuelve cuantas borro.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM SuscripcionPush s WHERE s.usuario.id = :usuarioId")
    int borrarDeUsuario(@Param("usuarioId") Long usuarioId);

    /**
     * Upsert atomico por {@code endpoint}. Con un "buscar y luego insertar",
     * dos altas simultaneas del mismo endpoint nuevo chocaban con la
     * restriccion UNIQUE y una respondia 500; {@code ON CONFLICT} lo resuelve
     * en la base. Devuelve {@code true} si inserto (fila nueva) y
     * {@code false} si actualizo ({@code xmax = 0} solo en filas recien
     * insertadas). Siempre refresca {@code updated_at}: es la fecha del
     * ultimo registro de ese navegador, que usa el tope por usuario.
     */
    @Query(value = """
            INSERT INTO suscripcion_push
                (usuario_id, endpoint, p256dh, auth, user_agent, activa, created_at, updated_at)
            VALUES (:usuarioId, :endpoint, :p256dh, :auth, :userAgent, TRUE, now(), now())
            ON CONFLICT (endpoint) DO UPDATE SET
                usuario_id = EXCLUDED.usuario_id,
                p256dh     = EXCLUDED.p256dh,
                auth       = EXCLUDED.auth,
                user_agent = EXCLUDED.user_agent,
                activa     = TRUE,
                updated_at = now()
            RETURNING (xmax = 0)
            """, nativeQuery = true)
    boolean upsert(@Param("usuarioId") Long usuarioId,
                   @Param("endpoint") String endpoint,
                   @Param("p256dh") String p256dh,
                   @Param("auth") String auth,
                   @Param("userAgent") String userAgent);
}
