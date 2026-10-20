package pe.edu.upc.viasegura.auth.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.auth.domain.Consentimiento;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;

/** Acceso a datos de {@link Consentimiento} (D-12). */
public interface ConsentimientoRepository extends JpaRepository<Consentimiento, Long> {

    /** La aceptacion vigente: la mas reciente sin revocar (indice parcial ix_consentimiento_vigente). */
    Optional<Consentimiento> findFirstByUsuarioIdAndFinalidadAndRevocadoEnIsNullOrderByAceptadoEnDescIdDesc(
            Long usuarioId, FinalidadConsentimiento finalidad);

    /** Todas las no revocadas de la finalidad: revocar las cierra todas, no solo la ultima. */
    List<Consentimiento> findByUsuarioIdAndFinalidadAndRevocadoEnIsNull(
            Long usuarioId, FinalidadConsentimiento finalidad);

    /** Historial completo del usuario, de la aceptacion mas reciente a la mas antigua. */
    List<Consentimiento> findByUsuarioIdOrderByAceptadoEnDescIdDesc(Long usuarioId);

    /**
     * Si el usuario tiene sin revocar una aceptacion de esa finalidad en esa
     * version, buscado por correo (el {@code Principal} del JWT) para que la
     * guarda de terminos pendientes haga una sola consulta por peticion.
     */
    @Query("""
            SELECT COUNT(c) > 0 FROM Consentimiento c
            WHERE c.usuario.email = :email
              AND c.finalidad = :finalidad
              AND c.versionDocumento = :version
              AND c.revocadoEn IS NULL
            """)
    boolean existeNoRevocadaPorEmail(@Param("email") String email,
                                     @Param("finalidad") FinalidadConsentimiento finalidad,
                                     @Param("version") String version);

    /**
     * Inserta la aceptacion salvo que ya exista una sin revocar de la misma
     * finalidad y version (indice unico parcial de V14). Con dos POST
     * simultaneos, el segundo espera al primero y no inserta: devuelve la
     * lista vacia en vez de fallar con la restriccion (500).
     */
    @Query(value = """
            INSERT INTO consentimiento (usuario_id, finalidad, version_documento, aceptado_en)
            VALUES (:usuarioId, :finalidad, :version, :aceptadoEn)
            ON CONFLICT (usuario_id, finalidad, version_documento) WHERE revocado_en IS NULL
            DO NOTHING
            RETURNING id
            """, nativeQuery = true)
    List<Long> insertarSiNoExiste(@Param("usuarioId") Long usuarioId,
                                  @Param("finalidad") String finalidad,
                                  @Param("version") String version,
                                  @Param("aceptadoEn") Instant aceptadoEn);

    /** La aceptacion sin revocar de esa finalidad y version (a lo sumo una, por V14). */
    Optional<Consentimiento> findFirstByUsuarioIdAndFinalidadAndVersionDocumentoAndRevocadoEnIsNull(
            Long usuarioId, FinalidadConsentimiento finalidad, String versionDocumento);
}
