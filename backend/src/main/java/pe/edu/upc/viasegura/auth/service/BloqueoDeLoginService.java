package pe.edu.upc.viasegura.auth.service;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.IntentoLogin;
import pe.edu.upc.viasegura.auth.domain.PoliticaDeBloqueoDeLogin;
import pe.edu.upc.viasegura.auth.repository.IntentoLoginRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;

/**
 * Bloqueo temporal del inicio de sesion tras intentos fallidos (US-02 Esc. 2).
 *
 * <p>Lo usa {@link AuthService#login}: primero {@link #exigirNoBloqueado},
 * despues de un 401 {@link #registrarFallo} y despues de un login correcto
 * {@link #olvidar}. Las dos escrituras van en {@code REQUIRES_NEW}: el login
 * corre en una transaccion de solo lectura que se revierte con el 401, y el
 * fallo tiene que quedar guardado igual.</p>
 */
@Service
@RequiredArgsConstructor
public class BloqueoDeLoginService {

    private final IntentoLoginRepository intentoLoginRepository;

    /** 409 {@code LOGIN_BLOQUEADO} si el correo esta bloqueado, exista o no la cuenta. */
    @Transactional(readOnly = true)
    public void exigirNoBloqueado(String email) {
        Instant ahora = Instant.now();
        Instant hasta = intentoLoginRepository.findById(PoliticaDeBloqueoDeLogin.clave(email))
                .map(IntentoLogin::getBloqueadoHasta)
                .orElse(null);
        if (PoliticaDeBloqueoDeLogin.estaBloqueado(hasta, ahora)) {
            throw new BusinessException(
                    PoliticaDeBloqueoDeLogin.mensaje(PoliticaDeBloqueoDeLogin.minutosRestantes(hasta, ahora)),
                    PoliticaDeBloqueoDeLogin.CODIGO_BLOQUEADO);
        }
    }

    /** Suma un intento fallido y, al llegar al tope, bloquea el correo. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void registrarFallo(String email) {
        Instant ahora = Instant.now();
        intentoLoginRepository.registrarFallo(
                PoliticaDeBloqueoDeLogin.clave(email),
                ahora,
                ahora.minus(PoliticaDeBloqueoDeLogin.DURACION),
                ahora.plus(PoliticaDeBloqueoDeLogin.DURACION),
                PoliticaDeBloqueoDeLogin.INTENTOS_MAXIMOS);
    }

    /** Login correcto: el contador vuelve a cero. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void olvidar(String email) {
        String clave = PoliticaDeBloqueoDeLogin.clave(email);
        if (intentoLoginRepository.existsById(clave)) {
            intentoLoginRepository.deleteById(clave);
        }
    }
}
