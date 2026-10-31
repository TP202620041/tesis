package pe.edu.upc.viasegura.auth.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;

/** Acceso a datos de {@link Usuario} (patron Repository, Spring Data JPA). */
public interface UsuarioRepository extends JpaRepository<Usuario, Long> {

    Optional<Usuario> findByEmail(String email);

    boolean existsByEmail(String email);

    /** Si hay alguna cuenta con ese rol (DEP-04: el ADMIN inicial solo se crea en una base sin ADMIN). */
    boolean existsByRol(Rol rol);

    // ------------------------------------------------------------------
    // BE-15: purga de las cuentas que nunca confirmaron su correo. Solo
    // cuentas CIUDADANO: el ADMIN y los funcionarios nunca entran (desde
    // NC-09b, asignar-funcionario.sql no asigna una cuenta sin confirmar).
    // ------------------------------------------------------------------

    /**
     * Las cuentas {@code CIUDADANO} sin confirmar creadas antes de
     * {@code limite} y sin un enlace de confirmacion vigente (sin usar, sin
     * anular y sin vencer en {@code ahora}): quien pidio el enlace con
     * «Reenviar» el ultimo dia todavia puede usarlo. Es solo la lista de
     * candidatas: cada una se vuelve a comprobar con su candado antes de
     * borrarla ({@code PurgaCuentasSinConfirmarService}).
     */
    @Query(value = """
            SELECT u.id FROM usuario u
            WHERE u.correo_confirmado = FALSE
              AND u.rol = 'CIUDADANO'
              AND u.created_at < :limite
              AND NOT EXISTS (
                  SELECT 1 FROM token_confirmacion_correo t
                  WHERE t.usuario_id = u.id
                    AND t.used_at IS NULL AND t.invalidated_at IS NULL AND t.expires_at > :ahora)
            ORDER BY u.id
            """, nativeQuery = true)
    List<Long> candidatasAPurga(@Param("limite") Instant limite, @Param("ahora") Instant ahora);

    /**
     * Toma el candado de la fila de una cuenta candidata ({@code FOR UPDATE},
     * el mismo que tomaria el {@code DELETE}), si sigue sin confirmar, es
     * {@code CIUDADANO} y fue creada antes de {@code limite}. Si una
     * confirmacion la esta modificando, espera a que termine y PostgreSQL
     * vuelve a evaluar la condicion sobre la fila nueva: una cuenta que se
     * confirmo en el medio ya no vuelve. Vacio = no se toca.
     */
    @Query(value = """
            SELECT u.id FROM usuario u
            WHERE u.id = :id AND u.correo_confirmado = FALSE AND u.rol = 'CIUDADANO' AND u.created_at < :limite
            FOR UPDATE
            """, nativeQuery = true)
    Optional<Long> bloquearSinConfirmarParaPurga(@Param("id") Long id, @Param("limite") Instant limite);

    /**
     * Toma el candado de la fila de la cuenta al confirmar el correo
     * ({@code FOR NO KEY UPDATE}, el mismo nivel que el {@code UPDATE} de la
     * confirmacion). Con la purga ({@code FOR UPDATE}) se excluyen: si la purga
     * borro la cuenta mientras se esperaba, no devuelve nada. No choca con los
     * {@code KEY SHARE} de quien inserta filas que la referencian (un reenvio
     * del enlace), asi que no agrega esperas ni bloqueos mutuos con ellos.
     */
    @Query(value = "SELECT u.id FROM usuario u WHERE u.id = :id FOR NO KEY UPDATE", nativeQuery = true)
    Optional<Long> bloquearParaConfirmar(@Param("id") Long id);

    /** Si la cuenta tiene foto de perfil: una cuenta sin confirmar no deberia (no pudo iniciar sesion). */
    boolean existsByIdAndFotoUrlIsNotNull(Long id);

    /**
     * Borra la cuenta, volviendo a comprobar en la misma sentencia que sigue
     * sin confirmar, que es {@code CIUDADANO} y que vencio su plazo. Devuelve
     * 1 si la borro. Si otra tabla la referencia, la clave foranea lo impide
     * y la sentencia falla: la purga lo registra y no la borra.
     */
    @Modifying
    @Query(value = """
            DELETE FROM usuario
            WHERE id = :id AND correo_confirmado = FALSE AND rol = 'CIUDADANO' AND created_at < :limite
            """, nativeQuery = true)
    int borrarSinConfirmar(@Param("id") Long id, @Param("limite") Instant limite);
}
