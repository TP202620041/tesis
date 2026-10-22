package pe.edu.upc.viasegura.notificaciones.infra;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.port.CorreoSaliente;
import pe.edu.upc.viasegura.common.port.MensajeCorreo;
import pe.edu.upc.viasegura.notificaciones.domain.AvisoReporte;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;
import pe.edu.upc.viasegura.notificaciones.port.NotificacionCanalAdapter;

/**
 * Canal EMAIL: el aviso sale por el puerto {@link CorreoSaliente} (DEP-08),
 * que en desarrollo y en los IT es SMTP (Mailhog, GreenMail) y en produccion
 * la API HTTP de Resend. Es el canal de fallback de US-16 (Escenario 2).
 *
 * <p>Ya corre asincrono y fuera de transaccion ({@code NotificacionService},
 * D-13): aqui solo cambia el transporte.</p>
 */
@Component
@RequiredArgsConstructor
public class EmailNotificacionAdapter implements NotificacionCanalAdapter {

    static final String ETIQUETA = "aviso-reporte";

    private final CorreoSaliente correo;

    @Override
    public CanalNotificacion canal() {
        return CanalNotificacion.EMAIL;
    }

    @Override
    public boolean estaDisponible(Usuario destinatario) {
        return StringUtils.hasText(destinatario.getEmail());
    }

    @Override
    public void enviar(Usuario destinatario, AvisoReporte aviso) {
        // Lanza CorreoNoEnviadoException si el proveedor falla; NotificacionService
        // la registra como FALLIDA.
        correo.enviar(new MensajeCorreo(destinatario.getEmail(), aviso.asunto(), aviso.mensaje(), ETIQUETA));
    }
}
