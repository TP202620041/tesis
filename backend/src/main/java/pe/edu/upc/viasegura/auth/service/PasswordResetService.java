package pe.edu.upc.viasegura.auth.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.PasswordResetToken;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.PasswordResetTokenRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;

/**
 * Recuperacion de contrasena por token de un solo uso (US-03).
 *
 * <p>Reutiliza la infraestructura de email ya existente (el bean
 * {@link JavaMailSender}, configurado a Mailhog en desarrollo y GreenMail en
 * tests desde la Fase 8 de notificaciones) enviando el correo directamente,
 * en vez de pasar por el pipeline de {@code NotificacionService}: ese
 * pipeline modela notificaciones sobre un {@code Reporte} con canal segun
 * preferencia del ciudadano (push/email/ambas), lo cual no encaja con un
 * correo de seguridad que siempre debe ir por email sin importar esa
 * preferencia. Se reusa el bean de correo, no el dominio de notificaciones
 * de reportes.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    /** Vigencia del token de recuperacion. */
    private static final long EXPIRACION_MINUTOS = 30;

    private final UsuarioRepository usuarioRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;

    @Value("${app.notificaciones.email-remitente:Ciudad Viva <no-reply@viasegura.pe>}")
    private String remitente;

    /**
     * Genera un token y lo envia por email. Responde igual (sin lanzar
     * error) si el correo no esta registrado, para no revelar que cuentas
     * existen: solo se omite el envio.
     */
    @Transactional
    public void solicitarRecuperacion(String email) {
        Usuario usuario = usuarioRepository.findByEmail(email).orElse(null);
        if (usuario == null) {
            log.info("Solicitud de recuperacion para email no registrado: {}", email);
            return;
        }

        PasswordResetToken token = tokenRepository.save(PasswordResetToken.builder()
                .usuario(usuario)
                .token(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plus(EXPIRACION_MINUTOS, ChronoUnit.MINUTES))
                .build());

        enviarCorreo(usuario, token.getToken());
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

    private void enviarCorreo(Usuario destinatario, String token) {
        SimpleMailMessage correo = new SimpleMailMessage();
        correo.setFrom(remitente);
        correo.setTo(destinatario.getEmail());
        correo.setSubject("Ciudad Viva: recuperacion de contrasena");
        correo.setText("""
                Hola %s,

                Recibimos una solicitud para restablecer tu contrasena. Usa el \
                siguiente token en la app (valido por %d minutos):

                %s

                Si no solicitaste esto, ignora este correo.
                """.formatted(destinatario.getNombre(), EXPIRACION_MINUTOS, token));
        mailSender.send(correo);
    }
}
