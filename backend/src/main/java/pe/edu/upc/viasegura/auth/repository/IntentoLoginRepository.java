package pe.edu.upc.viasegura.auth.repository;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.auth.domain.IntentoLogin;

/** Contador de intentos de inicio de sesion (US-02 Esc. 2). */
public interface IntentoLoginRepository extends JpaRepository<IntentoLogin, String> {

    /**
     * Reserva un intento <b>antes</b> de comprobar la contrasena, en una sola
     * sentencia atomica: si el correo no esta bloqueado, suma uno y devuelve
     * el nuevo conteo; si lo esta, no cambia nada y no devuelve filas.
     *
     * <p>Comprobar y contar en la misma sentencia es lo que impide que una
     * rafaga en paralelo pruebe mas de {@code maximo} contrasenas: dos
     * peticiones simultaneas sobre el mismo correo se serializan en el
     * candado de la fila del {@code ON CONFLICT}, y la que llega con el
     * bloqueo ya fijado no pasa el {@code WHERE}.</p>
     *
     * <p>El conteo vuelve a 1 si el ultimo intento es anterior a
     * {@code ventanaDesde} o si el bloqueo anterior ya vencio; al llegar a
     * {@code maximo} se fija {@code bloqueado_hasta = hasta}. Dentro del
     * {@code SET} las columnas son las de la fila anterior, por eso la
     * expresion del nuevo conteo se repite. La primera fila (insert) nunca
     * bloquea: {@code maximo} es mayor que 1.</p>
     *
     * <p>Sin {@code @Modifying}: con {@code RETURNING} la sentencia devuelve
     * filas y se ejecuta como consulta. Necesita una transaccion de escritura.</p>
     */
    @Query(value = """
            INSERT INTO intento_login (email, fallidos, ultimo_fallo, bloqueado_hasta)
            VALUES (:email, 1, :ahora, NULL)
            ON CONFLICT (email) DO UPDATE SET
                fallidos = CASE
                    WHEN intento_login.ultimo_fallo < :ventanaDesde
                      OR intento_login.bloqueado_hasta IS NOT NULL
                    THEN 1 ELSE intento_login.fallidos + 1 END,
                ultimo_fallo = :ahora,
                bloqueado_hasta = CASE
                    WHEN (CASE
                            WHEN intento_login.ultimo_fallo < :ventanaDesde
                              OR intento_login.bloqueado_hasta IS NOT NULL
                            THEN 1 ELSE intento_login.fallidos + 1 END) >= :maximo
                    THEN CAST(:hasta AS timestamptz) END
            WHERE intento_login.bloqueado_hasta IS NULL OR intento_login.bloqueado_hasta <= :ahora
            RETURNING fallidos
            """, nativeQuery = true)
    List<Integer> reservarIntento(@Param("email") String email,
                                  @Param("ahora") Instant ahora,
                                  @Param("ventanaDesde") Instant ventanaDesde,
                                  @Param("hasta") Instant hasta,
                                  @Param("maximo") int maximo);

    /** Login correcto: el contador vuelve a cero. */
    @Modifying
    @Query(value = "DELETE FROM intento_login WHERE email = :email", nativeQuery = true)
    int olvidar(@Param("email") String email);

    /**
     * Purga (US-02 Esc. 2): las filas que ya no cuentan para nada, con el
     * ultimo intento fuera de la ventana y sin bloqueo vigente.
     */
    @Modifying
    @Query(value = """
            DELETE FROM intento_login
            WHERE ultimo_fallo < :ventanaDesde
              AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= :ahora)
            """, nativeQuery = true)
    int purgarVencidos(@Param("ventanaDesde") Instant ventanaDesde, @Param("ahora") Instant ahora);
}
