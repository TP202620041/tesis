package pe.edu.upc.viasegura.auth.service;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.IntentoLogin;
import pe.edu.upc.viasegura.auth.domain.PoliticaDeBloqueoDeLogin;
import pe.edu.upc.viasegura.auth.repository.IntentoLoginRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;

/**
 * Bloqueo temporal del inicio de sesion tras intentos fallidos (US-02 Esc. 2).
 *
 * <p>Lo usa {@link AuthService#login}, que no es transaccional: primero
 * {@link #reservarIntento} (antes de comprobar la contrasena) y, si la
 * contrasena es correcta, {@link #olvidar}. Cada metodo es una transaccion
 * corta propia y ninguno se llama dentro de otra, asi que un login retiene a
 * lo sumo una conexion a la vez.</p>
 */
@Service
@RequiredArgsConstructor
public class BloqueoDeLoginService {

    private final IntentoLoginRepository intentoLoginRepository;

    /**
     * Cuenta este intento antes de comprobar la contrasena, o responde 409
     * {@code LOGIN_BLOQUEADO} si el correo esta bloqueado (exista o no la
     * cuenta). Comprobar y contar en la misma sentencia impide que una rafaga
     * en paralelo pruebe mas de {@value PoliticaDeBloqueoDeLogin#INTENTOS_MAXIMOS}
     * contrasenas (ver {@link IntentoLoginRepository#reservarIntento}).
     */
    @Transactional
    public void reservarIntento(String email) {
        String clave = PoliticaDeBloqueoDeLogin.clave(email);
        Instant ahora = Instant.now();
        boolean admitido = !intentoLoginRepository.reservarIntento(
                clave,
                ahora,
                ahora.minus(PoliticaDeBloqueoDeLogin.DURACION),
                ahora.plus(PoliticaDeBloqueoDeLogin.DURACION),
                PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS).isEmpty();
        if (admitido) {
            return;
        }
        Instant hasta = intentoLoginRepository.findById(clave)
                .map(IntentoLogin::getBloqueadoHasta)
                .filter(h -> PoliticaDeBloqueoDeLogin.estaBloqueado(h, ahora))
                .orElse(ahora.plus(PoliticaDeBloqueoDeLogin.DURACION));
        throw new BusinessException(
                PoliticaDeBloqueoDeLogin.mensaje(PoliticaDeBloqueoDeLogin.minutosRestantes(hasta, ahora)),
                PoliticaDeBloqueoDeLogin.CODIGO_BLOQUEADO);
    }

    /** Contrasena correcta: el contador vuelve a cero. */
    @Transactional
    public void olvidar(String email) {
        intentoLoginRepository.olvidar(PoliticaDeBloqueoDeLogin.clave(email));
    }
}
