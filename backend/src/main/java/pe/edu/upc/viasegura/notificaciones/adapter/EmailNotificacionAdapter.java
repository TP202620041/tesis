package pe.edu.upc.viasegura.notificaciones.adapter;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;

/**
 * Canal EMAIL: envio real por SMTP via {@link JavaMailSender}. En desarrollo
 * el SMTP apunta a Mailhog (docker-compose); en tests a GreenMail embebido.
 * Es el canal de fallback de US-16 (Escenario 2).
 */
@Component
@RequiredArgsConstructor
public class EmailNotificacionAdapter implements NotificacionCanalAdapter {

    private final JavaMailSender mailSender;

    @Value("${app.notificaciones.email-remitente:no-reply@viasegura.pe}")
    private String remitente;

    @Override
    public CanalNotificacion canal() {
        return CanalNotificacion.EMAIL;
    }

    @Override
    public boolean estaDisponible(Usuario destinatario) {
        return StringUtils.hasText(destinatario.getEmail());
    }

    @Override
    public void enviar(Usuario destinatario, String asunto, String mensaje) {
        SimpleMailMessage correo = new SimpleMailMessage();
        correo.setFrom(remitente);
        correo.setTo(destinatario.getEmail());
        correo.setSubject(asunto);
        correo.setText(mensaje);
        mailSender.send(correo); // lanza MailException si el SMTP falla
    }
}
