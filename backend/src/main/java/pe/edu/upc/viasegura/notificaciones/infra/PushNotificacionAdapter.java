package pe.edu.upc.viasegura.notificaciones.infra;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.notificaciones.domain.AvisoReporte;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;
import pe.edu.upc.viasegura.notificaciones.domain.DestinoPush;
import pe.edu.upc.viasegura.notificaciones.domain.ResultadoEnvioPush;
import pe.edu.upc.viasegura.notificaciones.domain.SuscripcionPush;
import pe.edu.upc.viasegura.notificaciones.port.EnviadorWebPush;
import pe.edu.upc.viasegura.notificaciones.port.NotificacionCanalAdapter;
import pe.edu.upc.viasegura.notificaciones.repository.SuscripcionPushRepository;

/**
 * Canal PUSH (US-21): envia el aviso a <b>todas</b> las suscripciones activas
 * del ciudadano por el puerto {@link EnviadorWebPush}.
 *
 * <ul>
 *   <li>Disponible si hay claves VAPID y al menos una suscripcion activa. El
 *       permiso {@code NOTIFICACIONES_PUSH} lo exige antes
 *       {@code NotificacionService} (D-12).</li>
 *   <li>404/410 del servicio de push: la suscripcion queda
 *       {@code activa = false} y no se vuelve a intentar; si el navegador se
 *       vuelve a suscribir, el upsert la reactiva.</li>
 *   <li>Si no se entrego a ninguna, lanza: {@code NotificacionService} lo
 *       registra {@code FALLIDA} y cae a correo si hay permiso. El cambio de
 *       estado nunca se ve afectado.</li>
 * </ul>
 *
 * <p>Payload (JSON que recibe el Service Worker): {@code titulo},
 * {@code cuerpo}, {@code url}, {@code reporteId} y {@code estado}. Solo datos
 * del reporte del propio ciudadano: ninguna senal interna (prioridad,
 * reincidencia) ni datos de otros usuarios.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PushNotificacionAdapter implements NotificacionCanalAdapter {

    private final SuscripcionPushRepository suscripcionPushRepository;
    private final EnviadorWebPush enviadorWebPush;
    private final ObjectMapper objectMapper;

    @Override
    public CanalNotificacion canal() {
        return CanalNotificacion.PUSH;
    }

    @Override
    public boolean estaDisponible(Usuario destinatario) {
        return enviadorWebPush.estaConfigurado()
                && suscripcionPushRepository.existsByUsuarioIdAndActivaTrue(destinatario.getId());
    }

    @Override
    public void enviar(Usuario destinatario, AvisoReporte aviso) {
        byte[] payload = payload(aviso);
        String topico = "reporte-" + aviso.reporteId();
        List<SuscripcionPush> activas = suscripcionPushRepository.findByUsuarioIdAndActivaTrue(destinatario.getId());
        int entregados = 0;
        for (SuscripcionPush s : activas) {
            ResultadoEnvioPush resultado = enviadorWebPush.enviar(DestinoPush.de(s), payload, topico);
            switch (resultado) {
                case ENTREGADO -> entregados++;
                case SUSCRIPCION_CADUCADA -> {
                    // save de Spring Data: transaccion corta propia, despues del HTTP.
                    s.setActiva(false);
                    suscripcionPushRepository.save(s);
                }
                case ERROR -> log.info("Push no entregado a una suscripcion del usuario {}", destinatario.getId());
            }
        }
        if (entregados == 0) {
            throw new IllegalStateException(
                    "Push no entregado a ninguna de las " + activas.size() + " suscripciones del usuario "
                            + destinatario.getId());
        }
    }

    private byte[] payload(AvisoReporte aviso) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("titulo", aviso.asunto());
        json.put("cuerpo", aviso.resumen());
        json.put("url", aviso.url());
        json.put("reporteId", aviso.reporteId());
        json.put("estado", aviso.estadoNuevo());
        try {
            return objectMapper.writeValueAsBytes(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo serializar el aviso push", e);
        }
    }
}
