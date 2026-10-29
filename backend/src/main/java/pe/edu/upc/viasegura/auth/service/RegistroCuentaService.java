package pe.edu.upc.viasegura.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.PreferenciaNotificacion;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.dto.RegistroRequest;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;

/**
 * La parte transaccional del registro de cuenta (US-01), separada de
 * {@link AuthService#registrar} en NC-08.
 *
 * <p>El registro verifica primero el captcha, una llamada HTTP a Cloudflare. Esa
 * espera no debe ocurrir dentro de una transaccion ni retener una conexion
 * del pool (D-13, ARCHITECTURE.md §4.5): {@code AuthService#registrar} ya no
 * es transaccional, verifica el captcha y recien entonces llama a este bean,
 * cuyo metodo {@code @Transactional} pasa por el proxy de Spring (una llamada
 * a un metodo propio no lo haria).</p>
 */
@Service
@RequiredArgsConstructor
public class RegistroCuentaService {

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final ConsentimientoService consentimientoService;
    private final ConfirmacionCorreoService confirmacionCorreoService;

    /**
     * Crea la cuenta ciudadana. D-12: la aceptacion de los terminos vigentes
     * se guarda en la misma transaccion; si la version no es la vigente, 409
     * y no se crea nada. Un correo ya registrado tambien es 409.
     *
     * <p>NC-09: la cuenta nace <b>sin confirmar</b> y, en la misma
     * transaccion, se pide su primer enlace de confirmacion; el correo sale
     * despues del commit.</p>
     */
    @Transactional
    public Usuario crearCuentaCiudadana(RegistroRequest request) {
        consentimientoService.exigirVersionVigenteDeTerminos(request.versionTerminos());
        if (usuarioRepository.existsByEmail(request.email())) {
            throw new BusinessException("El correo ya está registrado");
        }

        Usuario usuario = Usuario.builder()
                .email(request.email())
                .passwordHash(passwordEncoder.encode(request.password()))
                .nombre(request.nombre())
                .apellido(request.apellido())
                .rol(Rol.CIUDADANO)
                .preferenciaNotificacion(PreferenciaNotificacion.AMBAS)
                .activo(true)
                .correoConfirmado(false)
                .build();

        Usuario guardado = usuarioRepository.save(usuario);
        consentimientoService.registrarAceptacionDeTerminos(guardado, request.versionTerminos());
        confirmacionCorreoService.solicitarParaCuentaNueva(guardado);
        return guardado;
    }
}
