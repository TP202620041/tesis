package pe.edu.upc.viasegura.auth.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
