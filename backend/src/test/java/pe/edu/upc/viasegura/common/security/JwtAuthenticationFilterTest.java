package pe.edu.upc.viasegura.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

/**
 * US-04 Esc. 2: el filtro solo autentica un token cuya version de sesion es
 * la vigente de la cuenta, y falla cerrado si el {@code UserDetails} no la
 * informa.
 */
class JwtAuthenticationFilterTest {

    private static final String EMAIL = "vecina@lima.pe";

    private JwtService jwtService;

    @BeforeEach
    void preparar() {
        byte[] clave = new byte[48];
        new SecureRandom().nextBytes(clave);
        jwtService = new JwtService(Base64.getEncoder().encodeToString(clave), 60, false);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
    }

    /** Un {@code UserDetails} como el de {@code UsuarioDetailsService}, con su version. */
    private static final class ConVersion extends User implements ConVersionDeSesion {
        private final int version;

        ConVersion(int version) {
            super(EMAIL, "x", List.of(new SimpleGrantedAuthority("ROLE_CIUDADANO")));
            this.version = version;
        }

        @Override
        public int versionDeSesion() {
            return version;
        }
    }

    private boolean autentica(UserDetails cuenta, String token) throws Exception {
        UserDetailsService cargador = email -> cuenta;
        JwtAuthenticationFilter filtro = new JwtAuthenticationFilter(jwtService, cargador);
        MockHttpServletRequest peticion = new MockHttpServletRequest("GET", "/api/auth/me");
        peticion.addHeader("Authorization", "Bearer " + token);
        MockFilterChain cadena = new MockFilterChain();

        filtro.doFilter(peticion, new MockHttpServletResponse(), cadena);

        // La peticion sigue siempre por la cadena; lo que cambia es si va autenticada.
        assertThat(cadena.getRequest()).isNotNull();
        boolean autenticada = SecurityContextHolder.getContext().getAuthentication() != null;
        SecurityContextHolder.clearContext();
        return autenticada;
    }

    @Test
    void versionVigente_autentica() throws Exception {
        assertThat(autentica(new ConVersion(2), jwtService.generarToken(EMAIL, "CIUDADANO", 2))).isTrue();
    }

    @Test
    void versionRevocada_noAutentica() throws Exception {
        assertThat(autentica(new ConVersion(3), jwtService.generarToken(EMAIL, "CIUDADANO", 2))).isFalse();
    }

    @Test
    void tokenSinClaim_valeComoLaCero() throws Exception {
        String antiguo = jwtService.generarTokenSinVersion(EMAIL, "CIUDADANO");
        assertThat(autentica(new ConVersion(0), antiguo)).isTrue();
        assertThat(autentica(new ConVersion(1), antiguo)).isFalse();
    }

    @Test
    void userDetailsSinVersion_fallaCerrado() throws Exception {
        UserDetails sinVersion = User.withUsername(EMAIL).password("x").roles("CIUDADANO").build();

        assertThat(autentica(sinVersion, jwtService.generarToken(EMAIL, "CIUDADANO", 0))).isFalse();
    }
}
