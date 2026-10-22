package pe.edu.upc.viasegura.auth.repository;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.auth.domain.PasswordResetToken;

/** Acceso a datos de {@link PasswordResetToken} (US-03). */
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByToken(String token);

    /** Tokens que la cuenta pidio desde {@code desde}: el tope por hora de DEP-08 (indice por usuario, V8). */
    long countByUsuarioIdAndCreatedAtAfter(Long usuarioId, Instant desde);

    /**
     * Serializa las solicitudes de recuperacion de una misma cuenta hasta el
     * fin de la transaccion que llama (DEP-08), para que el tope por hora se
     * cuente sin carreras: un segundo pedido espera aqui a que el primero
     * haga commit, y despues su conteo ya ve el token nuevo.
     *
     * <p>{@code pg_advisory_xact_lock}: un candado de PostgreSQL que no toca
     * ninguna fila (no bloquea a quien edita el perfil ni a quien inserta
     * filas que referencian al usuario) y se libera solo con el commit o el
     * rollback. La clave es un hash de 64 bits de
     * {@code recuperacion-contrasena:<id>}, para no cruzarse con otro uso de
     * candados consultivos; una colision entre dos cuentas solo las haria
     * esperar una a la otra. Se usa en {@code FROM} y devuelve 1 porque la
     * funcion devuelve {@code void}, que Hibernate no sabe leer.</p>
     */
    @Query(value = "SELECT 1 FROM pg_advisory_xact_lock("
            + "hashtextextended('recuperacion-contrasena:' || CAST(:usuarioId AS text), 0))",
            nativeQuery = true)
    Integer bloquearSolicitudesDeRecuperacion(@Param("usuarioId") Long usuarioId);
}
