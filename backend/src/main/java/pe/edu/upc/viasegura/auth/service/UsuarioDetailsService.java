package pe.edu.upc.viasegura.auth.service;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.security.ConVersionDeSesion;

/**
 * Puente entre {@link Usuario} y Spring Security. Carga las credenciales
 * por email y mapea el rol a una autoridad {@code ROLE_<rol>}.
 */
@Service
@RequiredArgsConstructor
public class UsuarioDetailsService implements UserDetailsService {

    private final UsuarioRepository usuarioRepository;

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado: " + email));

        UserDetails base = User.withUsername(usuario.getEmail())
                .password(usuario.getPasswordHash())
                .authorities(List.of(new SimpleGrantedAuthority("ROLE_" + usuario.getRol().name())))
                .disabled(!usuario.isActivo())
                .build();
        return new CuentaConSesion(base, usuario.getVersionSesion());
    }

    /**
     * El {@link User} de Spring con la version de sesion de la cuenta, que el
     * filtro JWT compara con la del token (US-04 Esc. 2).
     */
    static final class CuentaConSesion extends User implements ConVersionDeSesion {

        private final int versionSesion;

        CuentaConSesion(UserDetails base, int versionSesion) {
            super(base.getUsername(), base.getPassword(), base.isEnabled(), base.isAccountNonExpired(),
                    base.isCredentialsNonExpired(), base.isAccountNonLocked(), base.getAuthorities());
            this.versionSesion = versionSesion;
        }

        @Override
        public int versionDeSesion() {
            return versionSesion;
        }

        @Override
        public boolean equals(Object otro) {
            return super.equals(otro);
        }

        @Override
        public int hashCode() {
            return super.hashCode();
        }
    }
}
