package pe.edu.upc.viasegura.auth.service;

import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;

/**
 * API publica de {@code auth} para que otros modulos obtengan el usuario
 * autenticado sin tocar {@link UsuarioRepository} (ARCHITECTURE.md 4.3:
 * de otro modulo solo se usa su {@code service}, {@code domain},
 * {@code event}, {@code port} o {@code dto}).
 *
 * <p>Desde BE-06 es el unico camino de los demas modulos hacia los
 * usuarios.</p>
 */
@Service
@RequiredArgsConstructor
public class UsuarioConsultaService {

    private final UsuarioRepository usuarioRepository;

    /**
     * Usuario de dominio por su correo (el {@code Principal#getName()} del JWT).
     *
     * <p>Se ejecuta dentro de la transaccion del llamador si la hay, asi que
     * sus asociaciones LAZY (p. ej. {@code distrito}) siguen accesibles alli.
     * Un token valido cuyo usuario ya no existe es un recurso inexistente
     * (404, {@link ResourceNotFoundException}), igual que el resto de los
     * servicios que resolvian el usuario por correo.</p>
     */
    @Transactional(readOnly = true)
    public Usuario usuarioPorEmail(String email) {
        return usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
    }

    /**
     * Usuario por id, o vacio si ya no existe. Lo usa quien recibe el id en un
     * evento (p. ej. las notificaciones) y decide que hacer si falta, en vez
     * de responder 404.
     */
    @Transactional(readOnly = true)
    public Optional<Usuario> usuarioPorId(Long id) {
        return usuarioRepository.findById(id);
    }
}
