package pe.edu.upc.viasegura.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.upc.viasegura.auth.domain.PreferenciaNotificacion;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.dto.AuthResponse;
import pe.edu.upc.viasegura.auth.dto.LoginRequest;
import pe.edu.upc.viasegura.auth.dto.RegistroRequest;
import pe.edu.upc.viasegura.auth.dto.UsuarioResponse;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;

/**
 * Casos de uso de acceso: registro (US-01) e inicio de sesion (US-02).
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final DistritoRepository distritoRepository;
    private final FotoStorageService fotoStorageService;

    /** US-01: registra una cuenta ciudadana y devuelve un token de sesion. */
    @Transactional
    public AuthResponse registrar(RegistroRequest request) {
        if (usuarioRepository.existsByEmail(request.email())) {
            throw new BusinessException("El correo ya esta registrado");
        }

        Usuario usuario = Usuario.builder()
                .email(request.email())
                .passwordHash(passwordEncoder.encode(request.password()))
                .nombre(request.nombre())
                .apellido(request.apellido())
                .rol(Rol.CIUDADANO)
                .preferenciaNotificacion(PreferenciaNotificacion.AMBAS)
                .activo(true)
                .build();

        Usuario guardado = usuarioRepository.save(usuario);
        return construirRespuesta(guardado);
    }

    /** US-02: valida credenciales y devuelve un token de sesion. */
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        // Lanza BadCredentialsException (=> HTTP 401) si son invalidas.
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password()));

        Usuario usuario = usuarioRepository.findByEmail(request.email())
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        return construirRespuesta(usuario);
    }

    /** Datos del usuario autenticado (US-02, base del perfil US-30). */
    @Transactional(readOnly = true)
    public UsuarioResponse perfilActual(String email) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        return UsuarioResponse.from(usuario);
    }

    /**
     * US-30 (parte minima): el ciudadano elige su canal de notificacion. El
     * listener de notificaciones (US-16/US-21) lee esta preferencia al enviar.
     */
    @Transactional
    public UsuarioResponse actualizarPreferenciaNotificacion(String email, PreferenciaNotificacion preferencia) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        usuario.setPreferenciaNotificacion(preferencia);
        return UsuarioResponse.from(usuarioRepository.save(usuario));
    }

    /**
     * US-30: el ciudadano edita nombre/apellido, foto y distrito de
     * residencia. Todos los parametros son opcionales (PATCH parcial, mismo
     * criterio que {@code EditarReporteRequest} de US-08): {@code null}/
     * ausente = no cambia ese campo. Reutiliza {@link FotoStorageService}
     * (ya provisto para las fotos de reporte, US-05) en vez de duplicar
     * almacenamiento. Solo CIUDADANO (restringido en el controller): para
     * FUNCIONARIO_MUNICIPAL el mismo campo {@code distrito} es su distrito
     * de GESTION, cambiarlo aqui seria un cambio de jurisdiccion, un caso
     * distinto y fuera de alcance de esta historia.
     */
    @Transactional
    public UsuarioResponse editarPerfil(String email, String nombre, String apellido,
                                         Long distritoId, MultipartFile foto) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        if (nombre != null) {
            if (!StringUtils.hasText(nombre)) {
                throw new IllegalArgumentException("El nombre no puede quedar vacio");
            }
            usuario.setNombre(nombre);
        }
        if (apellido != null) {
            if (!StringUtils.hasText(apellido)) {
                throw new IllegalArgumentException("El apellido no puede quedar vacio");
            }
            usuario.setApellido(apellido);
        }
        if (distritoId != null) {
            Distrito distrito = distritoRepository.findById(distritoId)
                    .orElseThrow(() -> new ResourceNotFoundException("Distrito no encontrado: " + distritoId));
            usuario.setDistrito(distrito);
        }
        if (foto != null && !foto.isEmpty()) {
            // Foto de perfil, no de reporte: se guarda aparte y su URL apunta
            // al endpoint autenticado, no al directorio publico (US-30).
            usuario.setFotoUrl(fotoStorageService.almacenarFotoPerfil(foto));
        }

        return UsuarioResponse.from(usuarioRepository.save(usuario));
    }

    private AuthResponse construirRespuesta(Usuario usuario) {
        String token = jwtService.generarToken(usuario.getEmail(), usuario.getRol().name());
        return AuthResponse.of(token, jwtService.getExpirationMinutes(), UsuarioResponse.from(usuario));
    }
}
