package pe.edu.upc.viasegura.auth.repository;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.auth.domain.IntentoLogin;

/** Contador de intentos fallidos de inicio de sesion (US-02 Esc. 2). */
public interface IntentoLoginRepository extends JpaRepository<IntentoLogin, String> {

    /**
     * Suma un fallo en una sola sentencia atomica (dos fallos simultaneos no
     * se pisan). La cuenta vuelve a 1 si el ultimo fallo es anterior a
     * {@code ventanaDesde} o si el bloqueo anterior ya vencio; al llegar a
     * {@code maximo} se fija {@code bloqueado_hasta = hasta}. Dentro del
     * {@code SET} las columnas son las de la fila anterior, por eso la
     * expresion del nuevo conteo se repite.
     */
    @Modifying
    @Query(value = """
            INSERT INTO intento_login (email, fallidos, ultimo_fallo, bloqueado_hasta)
            VALUES (:email, 1, :ahora, CASE WHEN 1 >= :maximo THEN CAST(:hasta AS timestamptz) END)
            ON CONFLICT (email) DO UPDATE SET
                fallidos = CASE
                    WHEN intento_login.ultimo_fallo < :ventanaDesde
                      OR (intento_login.bloqueado_hasta IS NOT NULL AND intento_login.bloqueado_hasta <= :ahora)
                    THEN 1 ELSE intento_login.fallidos + 1 END,
                ultimo_fallo = :ahora,
                bloqueado_hasta = CASE
                    WHEN (CASE
                            WHEN intento_login.ultimo_fallo < :ventanaDesde
                              OR (intento_login.bloqueado_hasta IS NOT NULL AND intento_login.bloqueado_hasta <= :ahora)
                            THEN 1 ELSE intento_login.fallidos + 1 END) >= :maximo
                    THEN CAST(:hasta AS timestamptz) END
            """, nativeQuery = true)
    void registrarFallo(@Param("email") String email,
                        @Param("ahora") Instant ahora,
                        @Param("ventanaDesde") Instant ventanaDesde,
                        @Param("hasta") Instant hasta,
                        @Param("maximo") int maximo);
}
