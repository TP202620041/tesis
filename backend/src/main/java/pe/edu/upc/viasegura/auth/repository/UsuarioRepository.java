package pe.edu.upc.viasegura.auth.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.auth.domain.Usuario;

/** Acceso a datos de {@link Usuario} (patron Repository, Spring Data JPA). */
public interface UsuarioRepository extends JpaRepository<Usuario, Long> {

    Optional<Usuario> findByEmail(String email);

    boolean existsByEmail(String email);
}
