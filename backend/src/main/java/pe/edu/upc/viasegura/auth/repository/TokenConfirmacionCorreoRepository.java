package pe.edu.upc.viasegura.auth.repository;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.auth.domain.TokenConfirmacionCorreo;

/** Acceso a datos de {@link TokenConfirmacionCorreo} (NC-09). */
public interface TokenConfirmacionCorreoRepository extends JpaRepository<TokenConfirmacionCorreo, Long> {

    Optional<TokenConfirmacionCorreo> findByTokenHash(String tokenHash);

    /** Enlaces que la cuenta pidio desde {@code desde}: los topes de reenvio (indice por usuario, V20). */
    long countByUsuarioIdAndCreatedAtAfter(Long usuarioId, Instant desde);

    /**
     * Guarda el hash del token recien generado, solo si la fila sigue
     * pendiente de emitir: sin hash, sin usar, sin anular y sin vencer.
     * Devuelve 1 si la emitio y 0 si no (un reenvio la anulo mientras el envio
     * esperaba en la cola, o ya se emitio). Condicional y no con
     * {@code save} sobre la entidad leida, para no pisar un
     * {@code invalidated_at} escrito en el medio (NC-09).
     */
    @Modifying
    @Query("UPDATE TokenConfirmacionCorreo t SET t.tokenHash = :hash "
            + "WHERE t.id = :id AND t.tokenHash IS NULL AND t.usedAt IS NULL AND t.invalidatedAt IS NULL "
            + "AND t.expiresAt > :ahora")
    int emitir(@Param("id") Long id, @Param("hash") String hash, @Param("ahora") Instant ahora);

    /**
     * Anula los enlaces de la cuenta que siguen sin usar ni anular, salvo
     * {@code excepto} (el que se acaba de usar, o {@code -1} para ninguno): al
     * pedir uno nuevo o al confirmar la cuenta, los anteriores dejan de servir.
     */
    @Modifying(flushAutomatically = true)
    @Query("UPDATE TokenConfirmacionCorreo t SET t.invalidatedAt = :ahora "
            + "WHERE t.usuario.id = :usuarioId AND t.id <> :excepto "
            + "AND t.usedAt IS NULL AND t.invalidatedAt IS NULL")
    int anularPendientes(@Param("usuarioId") Long usuarioId, @Param("excepto") Long excepto,
                         @Param("ahora") Instant ahora);

    /**
     * Serializa los reenvios de una misma cuenta hasta el fin de la transaccion
     * que llama, para contar los topes sin carreras. Mismo mecanismo que
     * {@code PasswordResetTokenRepository#bloquearSolicitudesDeRecuperacion}
     * (un {@code pg_advisory_xact_lock} que no toca filas), con otro prefijo
     * en la clave para no cruzarse con la recuperacion de contrasena.
     */
    @Query(value = "SELECT 1 FROM pg_advisory_xact_lock("
            + "hashtextextended('confirmacion-correo:' || CAST(:usuarioId AS text), 0))",
            nativeQuery = true)
    Integer bloquearSolicitudesDeConfirmacion(@Param("usuarioId") Long usuarioId);

    /**
     * BE-15: si la cuenta tiene un enlace vigente (sin usar, sin anular y sin
     * vencer en {@code ahora}). Incluye el que todavia espera su correo (sin
     * hash): quien pidio «Reenviar» puede estar por recibirlo.
     */
    @Query("SELECT COUNT(t) > 0 FROM TokenConfirmacionCorreo t WHERE t.usuario.id = :usuarioId "
            + "AND t.usedAt IS NULL AND t.invalidatedAt IS NULL AND t.expiresAt > :ahora")
    boolean existeVigente(@Param("usuarioId") Long usuarioId, @Param("ahora") Instant ahora);

    /** BE-15: los enlaces de una cuenta que se purga. */
    @Modifying
    @Query("DELETE FROM TokenConfirmacionCorreo t WHERE t.usuario.id = :usuarioId")
    int borrarDeUsuario(@Param("usuarioId") Long usuarioId);
}
