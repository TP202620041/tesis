package pe.edu.upc.viasegura.auth.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.auth.domain.PasswordResetToken;

/** Acceso a datos de {@link PasswordResetToken} (US-03). */
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByToken(String token);
}
