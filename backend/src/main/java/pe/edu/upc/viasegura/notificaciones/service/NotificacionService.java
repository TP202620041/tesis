package pe.edu.upc.viasegura.notificaciones.service;

import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.domain.PreferenciaNotificacion;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.ConsentimientoService;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.notificaciones.domain.AvisoReporte;
import pe.edu.upc.viasegura.notificaciones.domain.CanalNotificacion;
import pe.edu.upc.viasegura.notificaciones.domain.EstadoEntrega;
import pe.edu.upc.viasegura.notificaciones.domain.Notificacion;
import pe.edu.upc.viasegura.notificaciones.domain.TipoEvento;
import pe.edu.upc.viasegura.notificaciones.port.NotificacionCanalAdapter;
import pe.edu.upc.viasegura.notificaciones.repository.NotificacionRepository;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.event.ReporteEstadoCambiadoEvent;
import pe.edu.upc.viasegura.reportes.service.ReporteConsultaService;

/**
 * Orquesta la notificacion al ciudadano ante un cambio de estado de su
 * reporte (US-16, US-21).
 *
 * <p>Elige el/los canal(es) segun la preferencia del ciudadano, delega el
 * envio en el {@link NotificacionCanalAdapter} correspondiente y persiste
 * cada intento en {@code notificacion} con su {@link EstadoEntrega}. Aplica
 * el fallback push -> email de US-16 (Escenario 2): si el canal PUSH no esta
 * disponible o falla, entrega por EMAIL.</p>
 *
 * <p><b>El permiso manda (D-12).</b> Un canal solo se usa si el ciudadano
 * tiene vigente su consentimiento: {@code NOTIFICACIONES_PUSH} para PUSH y
 * {@code NOTIFICACIONES_CORREO} para EMAIL, tambien en el fallback. La
 * preferencia elige entre los canales permitidos; nunca habilita uno sin
 * permiso. Sin permiso el intento se registra {@code FALLIDA}, como un canal
 * no disponible, sin error. Los correos de seguridad (recuperar contrasena)
 * y la respuesta de soporte no pasan por aqui: los pidio el usuario y se
 * envian siempre.</p>
 *
 * <p>La comprobacion vive aqui y no en {@code PushNotificacionAdapter}: un
 * adaptador ({@code infra}) no puede llamar a un servicio (regla
 * {@code capas}), y asi la regla queda en un solo lugar para ambos canales.</p>
 */
@Slf4j
@Service
public class NotificacionService {

    private final Map<CanalNotificacion, NotificacionCanalAdapter> adapters =
            new EnumMap<>(CanalNotificacion.class);
    private final NotificacionRepository notificacionRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final ReporteConsultaService reporteConsultaService;
    private final ConsentimientoService consentimientoService;

    public NotificacionService(List<NotificacionCanalAdapter> adapterList,
                               NotificacionRepository notificacionRepository,
                               UsuarioConsultaService usuarioConsultaService,
                               ReporteConsultaService reporteConsultaService,
                               ConsentimientoService consentimientoService) {
        adapterList.forEach(a -> adapters.put(a.canal(), a));
        this.notificacionRepository = notificacionRepository;
        this.usuarioConsultaService = usuarioConsultaService;
        this.reporteConsultaService = reporteConsultaService;
        this.consentimientoService = consentimientoService;
    }

    /**
     * Si el canal puede usarse con ese ciudadano: permiso vigente (D-12) y
     * canal disponible (suscripcion push activa, direccion de correo).
     * Lo usa {@link #notificarCambioEstado} y es publico solo para que los IT
     * lo consulten directamente.
     */
    public boolean canalDisponible(Usuario destinatario, CanalNotificacion canal) {
        NotificacionCanalAdapter adapter = adapters.get(canal);
        return adapter != null
                && consentimientoService.tieneVigente(destinatario.getId(), finalidadDe(canal))
                && adapter.estaDisponible(destinatario);
    }

    private static FinalidadConsentimiento finalidadDe(CanalNotificacion canal) {
        return switch (canal) {
            case PUSH -> FinalidadConsentimiento.NOTIFICACIONES_PUSH;
            case EMAIL -> FinalidadConsentimiento.NOTIFICACIONES_CORREO;
        };
    }

    /**
     * Notifica el cambio de estado. Lo invoca el listener {@code AFTER_COMMIT}
     * en el executor asincrono ({@code AsyncConfig}), asi que el cambio de
     * estado ya esta confirmado y el funcionario no espera a la red.
     *
     * <p><b>Sin transaccion propia a proposito</b>, y por eso se aparta de
     * ARCHITECTURE.md 4.5 (que pide {@code REQUIRES_NEW}): los envios (SMTP,
     * HTTP al servicio de push) corren fuera de cualquier transaccion, sin
     * retener una conexion a la base. Cada lectura y cada escritura (el
     * registro de {@code notificacion}, la desactivacion de una suscripcion
     * caducada) es una transaccion corta del repositorio. La excepcion esta
     * registrada en
     * {@code project-context/decisions/propuestas/2026-10-20-notificaciones-fuera-de-transaccion.md}.</p>
     *
     * <p>Corre en el executor acotado ({@link AsyncConfig#EJECUTOR}); si la
     * cola esta llena, la llamada lanza {@code TaskRejectedException} y el
     * listener registra el aviso perdido.</p>
     */
    @Async(AsyncConfig.EJECUTOR)
    public void notificarCambioEstado(ReporteEstadoCambiadoEvent evento) {
        TipoEvento tipo = tipoEventoDe(evento.nuevo());
        if (tipo == null) {
            return; // estados que no notifican al ciudadano (p.ej. PENDIENTE)
        }
        Usuario destinatario = usuarioConsultaService.usuarioPorId(evento.creadorId()).orElse(null);
        if (destinatario == null) {
            log.warn("Reporte {} sin destinatario ({}): no se notifica",
                    evento.reporteId(), evento.creadorId());
            return;
        }
        // Referencia (proxy) solo para la FK: se persiste con su id, sin cargarla.
        Reporte reporte = reporteConsultaService.referencia(evento.reporteId());
        AvisoReporte aviso = new AvisoReporte(asuntoDe(tipo), componerMensaje(destinatario, evento),
                componerResumen(evento), evento.reporteId(), evento.nuevo().name());

        List<CanalNotificacion> objetivos = canalesSegunPreferencia(destinatario.getPreferenciaNotificacion());
        boolean emailEntregado = false;
        boolean pushFallo = false;

        for (CanalNotificacion canal : objetivos) {
            boolean ok = intentarEnviar(canal, destinatario, reporte, tipo, aviso);
            if (canal == CanalNotificacion.EMAIL && ok) {
                emailEntregado = true;
            }
            if (canal == CanalNotificacion.PUSH && !ok) {
                pushFallo = true;
            }
        }

        // Fallback US-16 Esc.2: push no entrego y email no era objetivo aun.
        if (pushFallo && !emailEntregado && !objetivos.contains(CanalNotificacion.EMAIL)) {
            log.info("Push no disponible para usuario {}: fallback a email", destinatario.getId());
            intentarEnviar(CanalNotificacion.EMAIL, destinatario, reporte, tipo, aviso);
        }
    }

    /**
     * Intenta un canal y registra el resultado. Devuelve true si se entrego.
     *
     * <p>El {@code try} envuelve solo el envio: si guardar el registro falla
     * despues de un envio exitoso, el aviso ya llego, asi que no se cuenta
     * como fallo de envio ni dispara el fallback a correo; solo se registra
     * el error.</p>
     */
    private boolean intentarEnviar(CanalNotificacion canal, Usuario destinatario, Reporte reporte,
                                   TipoEvento tipo, AvisoReporte aviso) {
        boolean entregado = false;
        if (canalDisponible(destinatario, canal)) {
            try {
                adapters.get(canal).enviar(destinatario, aviso);
                entregado = true;
            } catch (RuntimeException e) {
                log.warn("Fallo envio {} a usuario {}: {}", canal, destinatario.getId(), e.getMessage());
            }
        }
        registrar(canal, destinatario, reporte, tipo, aviso, entregado);
        return entregado;
    }

    private void registrar(CanalNotificacion canal, Usuario destinatario, Reporte reporte,
                           TipoEvento tipo, AvisoReporte aviso, boolean entregado) {
        Notificacion notificacion = Notificacion.builder()
                .usuario(destinatario)
                .reporte(reporte)
                .tipoEvento(tipo)
                .canal(canal)
                .mensaje(aviso.mensaje())
                .estadoEntrega(entregado ? EstadoEntrega.ENVIADA : EstadoEntrega.FALLIDA)
                .sentAt(entregado ? Instant.now() : null)
                .build();
        try {
            notificacionRepository.save(notificacion);
        } catch (RuntimeException e) {
            log.error("No se pudo registrar el aviso {} ({}) del reporte {} al usuario {}",
                    canal, entregado ? "ENVIADA" : "FALLIDA", aviso.reporteId(), destinatario.getId(), e);
        }
    }

    private List<CanalNotificacion> canalesSegunPreferencia(PreferenciaNotificacion preferencia) {
        return switch (preferencia) {
            case PUSH -> List.of(CanalNotificacion.PUSH);
            case EMAIL -> List.of(CanalNotificacion.EMAIL);
            // Sin preferencia explicita el default es AMBAS (columna NOT NULL).
            case AMBAS -> List.of(CanalNotificacion.PUSH, CanalNotificacion.EMAIL);
        };
    }

    private TipoEvento tipoEventoDe(EstadoReporte estado) {
        return switch (estado) {
            case RECIBIDO -> TipoEvento.REPORTE_RECIBIDO;
            case EN_PROCESO -> TipoEvento.REPORTE_EN_PROCESO;
            case RESUELTO -> TipoEvento.REPORTE_RESUELTO;
            case RECHAZADO -> TipoEvento.REPORTE_RECHAZADO;
            // PENDIENTE: estado inicial, nada que notificar. CANCELADO
            // (US-08): lo origina el propio ciudadano, no tiene sentido
            // notificarlo de su propia accion.
            case PENDIENTE, CANCELADO -> null;
        };
    }

    private String asuntoDe(TipoEvento tipo) {
        return switch (tipo) {
            case REPORTE_RECIBIDO -> "ViaSegura: su reporte fue recibido";
            case REPORTE_EN_PROCESO -> "ViaSegura: su reporte esta en proceso";
            case REPORTE_RESUELTO -> "ViaSegura: su reporte fue resuelto";
            case REPORTE_RECHAZADO -> "ViaSegura: su reporte fue rechazado";
            case ADHESION_REGISTRADA -> "ViaSegura: novedad en su reporte";
        };
    }

    /**
     * Texto corto del push (US-21): solo el estado nuevo, en palabras, sin el
     * comentario del municipio ni el distrito; el detalle se ve al abrir el
     * reporte.
     */
    private String componerResumen(ReporteEstadoCambiadoEvent evento) {
        return "Su reporte #" + evento.reporteId() + " " + etiquetaDe(evento.nuevo()) + ".";
    }

    /** El estado en palabras para el ciudadano; el valor tecnico va aparte en el payload. */
    static String etiquetaDe(EstadoReporte estado) {
        return switch (estado) {
            case PENDIENTE -> "esta pendiente";
            case RECIBIDO -> "fue recibido";
            case EN_PROCESO -> "esta en proceso";
            case RESUELTO -> "fue resuelto";
            case RECHAZADO -> "fue rechazado";
            case CANCELADO -> "fue cancelado";
        };
    }

    /** Mensaje al ciudadano (<= 500 chars, ver columna notificacion.mensaje). */
    private String componerMensaje(Usuario destinatario, ReporteEstadoCambiadoEvent evento) {
        StringBuilder sb = new StringBuilder()
                .append("Hola ").append(destinatario.getNombre()).append(", su reporte");
        if (evento.distritoNombre() != null) {
            sb.append(" en el distrito de ").append(evento.distritoNombre());
        }
        sb.append(" paso de ").append(evento.anterior())
                .append(" a ").append(evento.nuevo()).append(".");
        if (evento.comentario() != null && !evento.comentario().isBlank()) {
            sb.append(" Comentario del municipio: ").append(evento.comentario());
        }
        String mensaje = sb.toString();
        return mensaje.length() > 500 ? mensaje.substring(0, 500) : mensaje;
    }
}
