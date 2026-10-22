package pe.edu.upc.viasegura.common.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.net.ConnectException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import pe.edu.upc.viasegura.common.port.CorreoNoEnviadoException;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;

/** Adaptador SMTP (DEP-08) con un {@link JavaMailSender} simulado; el envio real lo cubren los IT con GreenMail. */
class SmtpCorreoAdapterTest {

    private static final String REMITENTE = "Ciudad Viva <no-reply@viasegura.pe>";
    private static final MensajeCorreo MENSAJE =
            new MensajeCorreo("ana@lima.pe", "Asunto", "Texto con un token-secreto", "soporte");

    private final JavaMailSender mailSender = mock(JavaMailSender.class);
    private final SmtpCorreoAdapter adaptador = new SmtpCorreoAdapter(mailSender, REMITENTE);

    @Test
    void envia_conElRemitenteConfigurado() {
        adaptador.enviar(MENSAJE);

        ArgumentCaptor<SimpleMailMessage> correo = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(correo.capture());
        assertThat(correo.getValue().getFrom()).isEqualTo(REMITENTE);
        assertThat(correo.getValue().getTo()).containsExactly("ana@lima.pe");
        assertThat(correo.getValue().getSubject()).isEqualTo("Asunto");
        assertThat(correo.getValue().getText()).isEqualTo("Texto con un token-secreto");
    }

    @Test
    void unFalloDeSmtp_esCorreoNoEnviadoSinElDestinatario() {
        doThrow(new MailSendException("Mail server connection failed for ana@lima.pe",
                new ConnectException("Connection refused")))
                .when(mailSender).send(any(SimpleMailMessage.class));

        CorreoNoEnviadoException error = catchThrowableOfType(CorreoNoEnviadoException.class,
                () -> adaptador.enviar(MENSAJE));

        assertThat(error).isNotNull();
        assertThat(error.status()).isEmpty();
        assertThat(error.getMessage()).contains("MailSendException", "ConnectException")
                .doesNotContain("ana@lima.pe", "token-secreto");
    }
}
