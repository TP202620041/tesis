package pe.edu.upc.viasegura.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.PreferenciaNotificacion;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.dto.AuthResponse;
import pe.edu.upc.viasegura.auth.dto.LoginRequest;
import pe.edu.upc.viasegura.auth.dto.RegistroRequest;
import pe.edu.upc.viasegura.auth.dto.UsuarioResponse;
import pe.edu.upc.viasegura.auth.event.FotoDePerfilReemplazadaEvent;
import pe.edu.upc.viasegura.auth.port.VerificadorDeCaptcha;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.common.port.ArchivoSubido;
import pe.edu.upc.viasegura.common.port.FotoStorageService;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.service.DistritoService;

/**
 * Casos de uso de acceso: registro (US-01) e inicio de sesion (US-02).
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    /** Largo de las columnas {@code usuario.nombre} y {@code usuario.apellido}, como en {@code RegistroRequest}. */
    static final int LARGO_MAXIMO_NOMBRE = 100;

    /** NC-08: con el captcha activo, un registro sin token. */
    static final String MENSAJE_FALTA_CAPTCHA = "Confirma que no eres un robot";

    private final UsuarioRepository usuarioRepository;
    private final RegistroCuentaService registroCuentaService;
    private final VerificadorDeCaptcha verificadorDeCaptcha;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final DistritoService distritoService;
    private final FotoStorageService fotoStorageService;
    private final ConsentimientoService consentimientoService;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * US-01: registra una cuenta ciudadana y devuelve un token de sesion.
     *
     * <p>NC-08: si el captcha esta activo ({@code CAPTCHA_TIPO=recaptcha}),
     * se verifica <b>primero</b>, antes que la version de los terminos y que
     * el correo duplicado: si no, el endpoint serviria para averiguar sin
     * captcha que correos tienen cuenta. Y se verifica <b>sin transaccion</b>
     * (por eso este metodo no es {@code @Transactional}): la llamada HTTP a
     * Google no debe retener una conexion del pool (D-13). La cuenta la crea
     * despues {@link RegistroCuentaService}, en su propia transaccion, con
     * las reglas de D-12.</p>
     */
    public AuthResponse registrar(RegistroRequest request) {
        if (verificadorDeCaptcha.exigido()) {
            if (!StringUtils.hasText(request.captchaToken())) {
                throw new BusinessException(MENSAJE_FALTA_CAPTCHA);
            }
            verificadorDeCaptcha.verificar(request.captchaToken());
        }
        Usuario guardado = registroCuentaService.crearCuentaCiudadana(request);
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
        return respuesta(usuario);
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
        return respuesta(usuarioRepository.save(usuario));
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
                                         Long distritoId, ArchivoSubido foto) {
        Usuario usuario = usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        if (nombre != null) {
            if (!StringUtils.hasText(nombre)) {
                throw new IllegalArgumentException("El nombre no puede quedar vacío");
            }
            exigirLargoMaximo(nombre, "El nombre");
            usuario.setNombre(nombre);
        }
        if (apellido != null) {
            if (!StringUtils.hasText(apellido)) {
                throw new IllegalArgumentException("El apellido no puede quedar vacío");
            }
            exigirLargoMaximo(apellido, "El apellido");
            usuario.setApellido(apellido);
        }
        if (distritoId != null) {
            usuario.setDistrito(distritoService.porId(distritoId));
        }
        if (foto != null && !foto.vacio()) {
            // Foto de perfil, no de reporte: se guarda aparte y su URL apunta
            // al endpoint autenticado, no al directorio publico (US-30).
            String anterior = PerfilFotoService.nombreDeArchivo(usuario.getFotoUrl());
            usuario.setFotoUrl(fotoStorageService.almacenarFotoPerfil(foto));
            if (anterior != null) {
                // DEP-12: la foto reemplazada ya no tiene finalidad y es un
                // dato personal (Ley N.° 29733). La borra
                // FotoDePerfilReemplazadaListener despues del commit, fuera
                // del hilo de la peticion (D-13): si el cambio de perfil
                // hiciera rollback, el ciudadano conservaria su foto anterior.
                eventPublisher.publishEvent(new FotoDePerfilReemplazadaEvent(usuario.getId(), anterior));
            }
        }

        return respuesta(usuarioRepository.save(usuario));
    }

    /**
     * Tope de la columna (QA-1 M-2). La edicion del perfil es multipart y no
     * pasa por {@code @Valid}: sin esta regla, un nombre mas largo llegaba a
     * la base y respondia 500. Se cuentan code points, como el {@code varchar}.
     */
    private static void exigirLargoMaximo(String valor, String campo) {
        if (valor.codePointCount(0, valor.length()) > LARGO_MAXIMO_NOMBRE) {
            throw new IllegalArgumentException(
                    campo + " puede tener como máximo " + LARGO_MAXIMO_NOMBRE + " caracteres");
        }
    }

    private AuthResponse construirRespuesta(Usuario usuario) {
        String token = jwtService.generarToken(usuario.getEmail(), usuario.getRol().name());
        return AuthResponse.of(token, jwtService.getExpirationMinutes(), respuesta(usuario));
    }

    /** Datos del propio usuario, con si le falta aceptar los terminos vigentes (D-12). */
    private UsuarioResponse respuesta(Usuario usuario) {
        return UsuarioResponse.from(usuario, consentimientoService.debeAceptarTerminos(usuario.getId()));
    }
}
