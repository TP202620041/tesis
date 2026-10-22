package pe.edu.upc.viasegura.auth.service;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.PasswordResetToken;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.event.RecuperacionSolicitadaEvent;
import pe.edu.upc.viasegura.auth.repository.PasswordResetTokenRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;

/**
 * Recuperacion de contrasena por token de un solo uso (US-03).
 *
 * <p><b>El correo sale despues del commit y fuera de la peticion</b> (DEP-08,
 * patron de D-13). {@link #solicitarRecuperacion} solo guarda el token y
 * publica {@link RecuperacionSolicitadaEvent}; {@code RecuperacionSolicitadaListener}
 * pide el mensaje a {@link #mensajeDeRecuperacion} y lo envia por el puerto
 * {@code CorreoSaliente} en el executor asincrono, sin transaccion abierta.
 * Asi el endpoint responde lo mismo, y en practicamente el mismo tiempo,
 * exista o no la cuenta, y un fallo del proveedor de correo no da 500 (antes
 * solo lo daba con una cuenta existente, lo que revelaba que existia).</p>
 *
 * <p>Es un correo de seguridad: sale siempre, sin mirar la preferencia ni el
 * consentimiento de notificaciones (D-12), y no pasa por
 * {@code NotificacionService}, que modela avisos sobre un reporte.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    /** Vigencia del token de recuperacion. */
    static final long EXPIRACION_MINUTOS = 30;

    /**
     * Tope de tokens por cuenta en {@link #VENTANA_TOPE} (DEP-08). Sin el,
     * un bucle sobre {@code POST /api/auth/recuperar-password} gastaria la
     * cuota diaria del proveedor de correo y dejaria sin avisos a todos.
     */
    static final int MAXIMO_TOKENS_POR_VENTANA = 3;
    static final Duration VENTANA_TOPE = Duration.ofHours(1);

    static final String ASUNTO = "Ciudad Viva: recuperacion de contrasena";
    static final String ETIQUETA = "recuperacion";

    private final UsuarioRepository usuarioRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Genera un token y deja el envio para despues del commit. No lanza
     * error ni deja rastro del correo si no esta registrado (no se revela que
     * cuentas existen), y tampoco si la cuenta ya pidio
     * {@value #MAXIMO_TOKENS_POR_VENTANA} tokens en la ultima hora: en ambos
     * casos el endpoint responde igual.
     */
    @Transactional
    public void solicitarRecuperacion(String email) {
        Optional<Usuario> encontrado = usuarioRepository.findByEmail(email);
        if (encontrado.isEmpty()) {
            return;
        }
        Usuario usuario = encontrado.get();

        // Pedidos simultaneos de la misma cuenta, de a uno hasta el commit:
        // si no, todos cuentan antes de que alguno guarde y el tope no frena.
        tokenRepository.bloquearSolicitudesDeRecuperacion(usuario.getId());
        long recientes = tokenRepository.countByUsuarioIdAndCreatedAtAfter(
                usuario.getId(), Instant.now().minus(VENTANA_TOPE));
        if (recientes >= MAXIMO_TOKENS_POR_VENTANA) {
            log.info("Recuperacion de contrasena: el usuario {} ya pidio {} tokens en la ultima hora; no se crea otro",
                    usuario.getId(), recientes);
            return;
        }

        PasswordResetToken token = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario)
                .token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plus(EXPIRACION_MINUTOS, ChronoUnit.MINUTES))
                .build());

        eventPublisher.publishEvent(new RecuperacionSolicitadaEvent(token.getId()));
    }

    /**
     * El correo de recuperacion del token {@code tokenId}, listo para enviar,
     * o vacio si ya no vale la pena enviarlo: el token no existe, ya se uso o
     * vencio mientras esperaba en la cola asincrona. Solo lectura y corto: lo
     * llama el listener antes de enviar, y el envio ocurre fuera de esta
     * transaccion.
     */
    @Transactional(readOnly = true)
    public Optional<MensajeCorreo> mensajeDeRecuperacion(Long tokenId) {
        return tokenRepository.findById(tokenId)
                .filter(PasswordResetToken::esValido)
                .map(token -> new MensajeCorreo(token.getUsuario().getEmail(), ASUNTO,
                        texto(token.getUsuario().getNombre(), token.getToken()), ETIQUETA));
    }

    /**
     * Restablece la contrasena si el token es valido (existe, no vencio, no
     * fue usado). Un token invalido es un 404; uno vencido o ya usado es un
     * conflicto de estado (409), igual criterio que otras precondiciones de
     * negocio de la API (p.ej. transiciones de estado de reporte).
     */
    @Transactional
    public void restablecer(String tokenPlano, String nuevaPassword) {
        PasswordResetToken token = tokenRepository.findByToken(tokenPlano)
                .orElseThrow(() -> new ResourceNotFoundException("Token de recuperacion invalido"));

        if (token.getUsedAt() != null) {
            throw new BusinessException("El token de recuperacion ya fue utilizado");
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException("El token de recuperacion vencio");
        }

        Usuario usuario = token.getUsuario();
        usuario.setPasswordHash(passwordEncoder.encode(nuevaPassword));
        usuarioRepository.save(usuario);

        token.setUsedAt(Instant.now());
        tokenRepository.save(token);
    }

    private static String texto(String nombre, String token) {
        return """
                Hola %s,

                Recibimos una solicitud para restablecer tu contrasena. Usa el \
                siguiente token en la app (valido por %d minutos):

                %s

                Si no solicitaste esto, ignora este correo.
                """.formatted(nombre, EXPIRACION_MINUTOS, token);
    }
}
