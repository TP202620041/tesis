package pe.edu.upc.viasegura.reportes.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.reportes.domain.IdempotencyKey;

/** Acceso a datos de {@link IdempotencyKey} (US-06). */
public interface IdempotencyKeyRepository extends JpaRepository<IdempotencyKey, Long> {

    Optional<IdempotencyKey> findByClaveAndUsuarioId(String clave, Long usuarioId);

    void deleteByClaveAndUsuarioId(String clave, Long usuarioId);
}
