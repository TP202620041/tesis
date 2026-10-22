package pe.edu.upc.viasegura.common.infra;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.CorreoSaliente;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;

/**
 * Correo por SMTP con el {@link JavaMailSender} de Spring Boot (DEP-08). Es el
 * adaptador por defecto ({@code app.correo.tipo=smtp}): en desarrollo apunta a
 * Mailhog (docker-compose) y en los IT a GreenMail embebido. Es el
 * <b>unico</b> lugar del codigo que usa {@code JavaMailSender}.
 *
 * <p>En produccion no sirve: el plan de Railway bloquea el SMTP saliente, y
 * por eso existe {@code ResendCorreoAdapter}. Los timeouts de JavaMail (5 s)
 * estan en {@code application.yml}.</p>
 *
 * <p>La etiqueta del mensaje no viaja por SMTP: sirve para filtrar en el
 * panel del proveedor HTTP, y aqui no hay panel.</p>
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.correo.tipo", havingValue = "smtp", matchIfMissing = true)
public class SmtpCorreoAdapter implements CorreoSaliente {

    private final JavaMailSender mailSender;
    private final String remitente;

    public SmtpCorreoAdapter(JavaMailSender mailSender,
                             @Value("${app.notificaciones.email-remitente}") String remitente) {
        this.mailSender = mailSender;
        this.remitente = remitente;
        log.info("Correo saliente por SMTP (remitente {})", remitente);
    }

    @Override
    public void enviar(MensajeCorreo mensaje) {
        SimpleMailMessage correo = new SimpleMailMessage();
        correo.setFrom(remitente);
        correo.setTo(mensaje.para());
        correo.setSubject(mensaje.asunto());
        correo.setText(mensaje.texto());
        try {
            mailSender.send(correo);
        } catch (MailException e) {
            // Solo los nombres de las clases: el mensaje de JavaMail puede
            // traer la direccion del destinatario.
            Throwable causa = NestedExceptionUtils.getMostSpecificCause(e);
            throw new CorreoNoEnviadoException("El servidor SMTP no acepto el correo ("
                    + e.getClass().getSimpleName()
                    + (causa != e ? ", " + causa.getClass().getSimpleName() : "") + ")");
        }
    }
}
