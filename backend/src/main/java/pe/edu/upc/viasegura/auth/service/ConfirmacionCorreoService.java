package pe.edu.upc.viasegura.auth.service;

import java.net.URI;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.TokenConfirmacionCorreo;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.event.ConfirmacionCorreoSolicitadaEvent;
import pe.edu.upc.viasegura.auth.repository.TokenConfirmacionCorreoRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;

/**
 * Confirmacion del correo de una cuenta (NC-09). Una cuenta nueva nace sin
 * confirmar y no puede iniciar sesion hasta abrir el enlace que recibe por
 * correo (decision del usuario, 28/10).
 *
 * <p>Sigue el patron de la recuperacion de contrasena ({@link PasswordResetService},
 * DEP-08): el pedido guarda una fila y publica un evento con su id, y el
 * correo sale despues del commit, en el executor asincrono y sin transaccion
 * abierta ({@code ConfirmacionCorreoSolicitadaListener}, D-13). La diferencia
 * es que aqui el token se guarda <b>hasheado</b>, asi que no se puede
 * reconstruir a partir del id: lo genera {@link #emitirMensaje} en el hilo
 * que envia el correo, guarda solo su SHA-256 y lo pone en el enlace. El valor
 * no pasa por la peticion, por el evento ni por la base.</p>
 *
 * <p><b>El enlace</b> es {@code <PWA>/confirmar-cuenta?token=…}. La PWA lee el
 * token y llama a {@code POST /api/auth/confirmar-correo}; la confirmacion no
 * inicia sesion (como el restablecimiento de contrasena): la persona entra
 * despues con su contrasena. La URL de la PWA sale de {@code FRONTEND_URL} o,
 * si no esta definida, del primer origen de {@code CORS_ALLOWED_ORIGINS}, que
 * en produccion ya es obligatorio y es exactamente el origen de la PWA: asi no
 * se suma ninguna variable obligatoria.</p>
 */
@Slf4j
@Service
public class ConfirmacionCorreoService {

    /** Vigencia del enlace. */
    public static final Duration VIGENCIA = Duration.ofHours(24);

    /** Un reenvio por cuenta como maximo cada minuto, contando el del registro. */
    static final Duration ESPERA_ENTRE_ENVIOS = Duration.ofMinutes(1);

    /**
     * Y como maximo {@value #MAXIMO_POR_HORA} por hora. Sin este tope, un bucle
     * que respete el minuto gastaria igual la cuota diaria del proveedor de
     * correo (100 en Resend Free) con una sola cuenta.
     */
    static final int MAXIMO_POR_HORA = 5;
    static final Duration VENTANA_TOPE = Duration.ofHours(1);

    static final String ASUNTO = "Ciudad Viva: confirma tu correo";
    static final String ETIQUETA = "confirmacion-correo";
    static final String RUTA_PWA = "/confirmar-cuenta";

    /** Login con la contrasena correcta y la cuenta sin confirmar (409). */
    public static final String CODIGO_CORREO_NO_CONFIRMADO = "CORREO_NO_CONFIRMADO";
    public static final String MENSAJE_CORREO_NO_CONFIRMADO = "Confirma tu correo para iniciar sesión. Te"
            + " enviamos un enlace al registrarte; si no lo encuentras, revisa la carpeta de spam o pide uno nuevo.";

    public static final String CODIGO_CONFIRMACION_INVALIDA = "CONFIRMACION_INVALIDA";
    public static final String CODIGO_CONFIRMACION_VENCIDA = "CONFIRMACION_VENCIDA";
    public static final String CODIGO_CONFIRMACION_REEMPLAZADA = "CONFIRMACION_REEMPLAZADA";
    public static final String CODIGO_CORREO_YA_CONFIRMADO = "CORREO_YA_CONFIRMADO";

    static final String MENSAJE_INVALIDA = "El enlace de confirmación no es válido. Revisa que lo hayas copiado"
            + " completo o pide uno nuevo desde el inicio de sesión.";
    static final String MENSAJE_VENCIDA = "El enlace de confirmación venció. Pide uno nuevo desde el inicio de"
            + " sesión.";
    static final String MENSAJE_REEMPLAZADA = "Este enlace ya no sirve porque pediste uno nuevo. Usa el del"
            + " último correo que te enviamos.";
    static final String MENSAJE_YA_CONFIRMADO = "Tu correo ya está confirmado. Inicia sesión con tu contraseña.";

    /** 32 bytes: 256 bits de azar, 43 caracteres en base64url. */
    private static final int BYTES_DEL_TOKEN = 32;
    private static final SecureRandom ALEATORIO = new SecureRandom();

    private final UsuarioRepository usuarioRepository;
    private final TokenConfirmacionCorreoRepository tokenRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final String urlPwa;

    public ConfirmacionCorreoService(UsuarioRepository usuarioRepository,
                                     TokenConfirmacionCorreoRepository tokenRepository,
                                     ApplicationEventPublisher eventPublisher,
                                     @Value("${app.frontend.url:}") String urlFrontend,
                                     @Value("${app.cors.allowed-origins}") List<String> origenesPermitidos) {
        this.usuarioRepository = usuarioRepository;
        this.tokenRepository = tokenRepository;
        this.eventPublisher = eventPublisher;
        this.urlPwa = urlDeLaPwa(urlFrontend, origenesPermitidos);
    }

    /**
     * {@code FRONTEND_URL} si esta definida; si no, el primer origen de CORS.
     * Tiene que ser un origen {@code http(s)://host[:puerto]} sin ruta: el
     * servicio le agrega {@value #RUTA_PWA}. Si no, la aplicacion no arranca
     * (un enlace roto solo se notaria cuando nadie pudiera confirmar).
     */
    static String urlDeLaPwa(String urlFrontend, List<String> origenesPermitidos) {
        String candidata = StringUtils.hasText(urlFrontend) ? urlFrontend.strip()
                : origenesPermitidos.stream().filter(StringUtils::hasText).map(String::strip).findFirst().orElse("");
        while (candidata.endsWith("/")) {
            candidata = candidata.substring(0, candidata.length() - 1);
        }
        URI uri;
        try {
            uri = URI.create(candidata);
        } catch (IllegalArgumentException e) {
            uri = null;
        }
        boolean valida = uri != null
                && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                && StringUtils.hasText(uri.getHost())
                && !StringUtils.hasText(uri.getPath())
                && uri.getQuery() == null && uri.getFragment() == null && uri.getUserInfo() == null;
        if (!valida) {
            throw new IllegalStateException("La URL de la PWA para el enlace de confirmacion no es valida: defina"
                    + " FRONTEND_URL (o CORS_ALLOWED_ORIGINS) con un origen como https://ciudadviva.app, sin ruta.");
        }
        return candidata;
    }

    /**
     * Pide el primer enlace de una cuenta recien creada. Lo llama
     * {@code RegistroCuentaService} dentro de su transaccion: si el registro
     * hace rollback, no se envia nada ({@code AFTER_COMMIT}).
     */
    @Transactional
    public void solicitarParaCuentaNueva(Usuario usuario) {
        crearSolicitud(usuario, Instant.now());
    }

    /**
     * {@code POST /api/auth/reenviar-confirmacion}. No dice nada al que llama:
     * el endpoint responde lo mismo si la cuenta no existe, si ya esta
     * confirmada, si se alcanzo un tope o si se pidio el enlace (no permite
     * averiguar que correos tienen cuenta). Topes por cuenta: un enlace por
     * minuto (el del registro cuenta) y {@value #MAXIMO_POR_HORA} por hora. Un
     * enlace nuevo anula los anteriores.
     */
    @Transactional
    public void reenviar(String email) {
        Optional<Usuario> encontrado = usuarioRepository.findByEmail(email);
        if (encontrado.isEmpty() || encontrado.get().isCorreoConfirmado()) {
            return;
        }
        Usuario usuario = encontrado.get();

        // Pedidos simultaneos de la misma cuenta, de a uno hasta el commit:
        // si no, todos cuentan antes de que alguno guarde y el tope no frena.
        tokenRepository.bloquearSolicitudesDeConfirmacion(usuario.getId());
        Instant ahora = Instant.now();
        if (tokenRepository.countByUsuarioIdAndCreatedAtAfter(usuario.getId(), ahora.minus(ESPERA_ENTRE_ENVIOS)) > 0) {
            log.info("Confirmacion de correo: el usuario {} pidio un enlace hace menos de un minuto; no se crea otro",
                    usuario.getId());
            return;
        }
        long enLaUltimaHora = tokenRepository.countByUsuarioIdAndCreatedAtAfter(
                usuario.getId(), ahora.minus(VENTANA_TOPE));
        if (enLaUltimaHora >= MAXIMO_POR_HORA) {
            log.info("Confirmacion de correo: el usuario {} ya pidio {} enlaces en la ultima hora; no se crea otro",
                    usuario.getId(), enLaUltimaHora);
            return;
        }
        tokenRepository.anularPendientes(usuario.getId(), -1L, ahora);
        crearSolicitud(usuario, ahora);
    }

    private void crearSolicitud(Usuario usuario, Instant ahora) {
        TokenConfirmacionCorreo token = tokenRepository.save(TokenConfirmacionCorreo.builder()
                .usuario(usuario)
                .expiresAt(ahora.plus(VIGENCIA))
                .build());
        eventPublisher.publishEvent(new ConfirmacionCorreoSolicitadaEvent(token.getId()));
    }

    /**
     * El correo de confirmacion de la fila {@code tokenId}, listo para enviar,
     * o vacio si ya no corresponde: la fila no existe, ya se emitio, se anulo
     * (la persona pidio otro mientras este esperaba en la cola), vencio, o la
     * cuenta ya esta confirmada.
     *
     * <p>Genera aqui el token (256 bits de {@link SecureRandom}) y guarda solo
     * su hash, en una transaccion corta. La llama el listener en el hilo
     * asincrono, y el envio ocurre despues, fuera de esta transaccion.</p>
     */
    @Transactional
    public Optional<MensajeCorreo> emitirMensaje(Long tokenId) {
        Optional<TokenConfirmacionCorreo> encontrado = tokenRepository.findById(tokenId);
        Instant ahora = Instant.now();
        if (encontrado.isEmpty() || !encontrado.get().puedeEmitirse(ahora)
                || encontrado.get().getUsuario().isCorreoConfirmado()) {
            return Optional.empty();
        }
        TokenConfirmacionCorreo token = encontrado.get();
        String tokenPlano = nuevoToken();
        token.emitir(TokenConfirmacionCorreo.hashDe(tokenPlano));
        tokenRepository.save(token);

        Usuario usuario = token.getUsuario();
        return Optional.of(new MensajeCorreo(usuario.getEmail(), ASUNTO,
                texto(usuario.getNombre(), urlPwa + RUTA_PWA + "?token=" + tokenPlano), ETIQUETA));
    }

    /**
     * {@code POST /api/auth/confirmar-correo}: marca la cuenta confirmada y
     * anula los demas enlaces pendientes. No inicia sesion. Un token
     * desconocido, de una cuenta ya confirmada, anulado o vencido es 409 con
     * un mensaje para el ciudadano y un codigo para la PWA.
     */
    @Transactional
    public void confirmar(String tokenPlano) {
        TokenConfirmacionCorreo token = tokenRepository.findByTokenHash(TokenConfirmacionCorreo.hashDe(tokenPlano))
                .orElseThrow(() -> new BusinessException(MENSAJE_INVALIDA, CODIGO_CONFIRMACION_INVALIDA));
        Usuario usuario = token.getUsuario();
        Instant ahora = Instant.now();

        // Un enlace usado implica una cuenta confirmada: lo cubre este caso, con
        // el mensaje que le sirve a quien vuelve a abrir el enlace (o a quien
        // se le adelanto el antivirus del correo abriendolo primero).
        if (usuario.isCorreoConfirmado()) {
            throw new BusinessException(MENSAJE_YA_CONFIRMADO, CODIGO_CORREO_YA_CONFIRMADO);
        }
        if (token.getInvalidatedAt() != null) {
            throw new BusinessException(MENSAJE_REEMPLAZADA, CODIGO_CONFIRMACION_REEMPLAZADA);
        }
        if (token.vencio(ahora)) {
            throw new BusinessException(MENSAJE_VENCIDA, CODIGO_CONFIRMACION_VENCIDA);
        }

        token.usar(ahora);
        usuario.confirmarCorreo(ahora);
        usuarioRepository.save(usuario);
        tokenRepository.save(token);
        tokenRepository.anularPendientes(usuario.getId(), token.getId(), ahora);
    }

    private static String nuevoToken() {
        byte[] azar = new byte[BYTES_DEL_TOKEN];
        ALEATORIO.nextBytes(azar);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(azar);
    }

    private static String texto(String nombre, String enlace) {
        return """
                Hola, %s:

                Gracias por registrarte en Ciudad Viva. Para activar tu cuenta, abre este enlace \
                (vence en %d horas):

                %s

                Si no creaste esta cuenta, ignora este correo: sin confirmarla, nadie puede iniciar sesión con ella.
                """.formatted(nombre, VIGENCIA.toHours(), enlace);
    }
}
