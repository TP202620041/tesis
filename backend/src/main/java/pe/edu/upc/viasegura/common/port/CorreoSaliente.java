package pe.edu.upc.viasegura.common.port;

/**
 * Correo saliente (DEP-08): el unico camino por el que la aplicacion envia un
 * correo. Lo usan tres modulos, por eso vive en {@code common} (D-11):
 * {@code auth} (recuperacion de contrasena, US-03), {@code soporte}
 * (respuesta a un ticket, US-25) y {@code notificaciones} (aviso de cambio de
 * estado por el canal EMAIL, US-16). Ponerlo en {@code notificaciones}
 * crearia el ciclo {@code auth} -> {@code notificaciones} -> {@code auth}.
 *
 * <p>Dos adaptadores en {@code common/infra}, elegidos con
 * {@code app.correo.tipo} ({@code CORREO_TIPO}):</p>
 * <ul>
 *   <li>{@code smtp} ({@code SmtpCorreoAdapter}): desarrollo con Mailhog y los
 *       IT con GreenMail;</li>
 *   <li>{@code resend} ({@code ResendCorreoAdapter}): produccion, por la API
 *       HTTP de Resend, porque el plan de Railway bloquea el SMTP saliente.</li>
 * </ul>
 *
 * <p>El remitente no viaja en el mensaje: lo fija el adaptador
 * ({@code NOTIF_FROM}), igual para todos los correos. Quien llama envia
 * <b>fuera de toda transaccion</b> (D-13): un proveedor lento no debe retener
 * una conexion del pool ni la respuesta al usuario.</p>
 */
public interface CorreoSaliente {

    /**
     * Envia un correo de texto.
     *
     * @throws CorreoNoEnviadoException si el proveedor lo rechaza o no
     *         responde a tiempo. Sin reintentos: quien llama decide (hoy,
     *         registrar el fallo y seguir).
     */
    void enviar(MensajeCorreo mensaje);
}
