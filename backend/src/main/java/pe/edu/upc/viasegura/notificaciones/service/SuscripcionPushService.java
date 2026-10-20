package pe.edu.upc.viasegura.notificaciones.service;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.ConsentimientoService;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.notificaciones.domain.PoliticaEndpointPush;
import pe.edu.upc.viasegura.notificaciones.domain.SuscripcionPush;
import pe.edu.upc.viasegura.notificaciones.dto.ClavePublicaVapidResponse;
import pe.edu.upc.viasegura.notificaciones.dto.SuscripcionPushRequest;
import pe.edu.upc.viasegura.notificaciones.dto.SuscripcionPushResponse;
import pe.edu.upc.viasegura.notificaciones.port.EnviadorWebPush;
import pe.edu.upc.viasegura.notificaciones.repository.SuscripcionPushRepository;

/**
 * Suscripciones Web Push de los navegadores (SUSCRIPCION_PUSH, NC-07).
 *
 * <p>Solo registra y da de baja; el envio real es US-21. Mientras tanto,
 * {@code PushNotificacionAdapter} ya consulta estas filas para decidir si el
 * canal PUSH esta disponible.</p>
 */
@Service
public class SuscripcionPushService {

    private final SuscripcionPushRepository suscripcionRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final ConsentimientoService consentimientoService;
    private final EnviadorWebPush enviadorWebPush;
    private final List<String> hostsPermitidos;
    private final int maxPorUsuario;

    public SuscripcionPushService(
            SuscripcionPushRepository suscripcionRepository,
            UsuarioConsultaService usuarioConsultaService,
            ConsentimientoService consentimientoService,
            EnviadorWebPush enviadorWebPush,
            @Value("${app.notificaciones.push.hosts-permitidos}") List<String> hostsPermitidos,
            @Value("${app.notificaciones.push.max-por-usuario:10}") int maxPorUsuario) {
        if (maxPorUsuario < 1) {
            throw new IllegalStateException("app.notificaciones.push.max-por-usuario debe ser >= 1");
        }
        this.suscripcionRepository = suscripcionRepository;
        this.usuarioConsultaService = usuarioConsultaService;
        this.consentimientoService = consentimientoService;
        this.enviadorWebPush = enviadorWebPush;
        this.hostsPermitidos = List.copyOf(hostsPermitidos);
        this.maxPorUsuario = maxPorUsuario;
    }

    /** Resultado del alta: si la fila es nueva (201) o ya existia (200). */
    public record ResultadoSuscripcion(boolean creada, SuscripcionPushResponse suscripcion) {}

    /**
     * Upsert por {@code endpoint}. El endpoint identifica al navegador, no a
     * la persona, asi que:
     * <ul>
     *   <li>si no existe, se crea para el usuario autenticado;</li>
     *   <li>si existe, se actualizan las claves y el user agent (el navegador
     *       puede rotarlas), se reactiva y se asigna al usuario autenticado
     *       <b>aunque fuera de otro</b>: en ese navegador inicio sesion otra
     *       persona y los avisos del anterior no deben seguir llegando ahi.</li>
     * </ul>
     * Solo se aceptan servicios de push de la lista blanca
     * ({@link PoliticaEndpointPush}, contra SSRF). Al superar el tope por
     * usuario se borran las menos recientemente registradas: ver
     * {@link #aplicarTope}.
     *
     * <p>D-12: exige el consentimiento {@code NOTIFICACIONES_PUSH} vigente
     * (409 si no lo hay). El permiso del navegador no basta: es del
     * dispositivo, no la autorizacion del titular de los datos.</p>
     */
    @Transactional
    public ResultadoSuscripcion suscribir(String email, SuscripcionPushRequest req) {
        if (!PoliticaEndpointPush.esPermitido(req.endpoint(), hostsPermitidos)) {
            throw new IllegalArgumentException(
                    "endpoint: el servicio de push no esta permitido");
        }
        Usuario usuario = usuarioConsultaService.usuarioPorEmail(email);
        if (!consentimientoService.tieneVigente(usuario.getId(), FinalidadConsentimiento.NOTIFICACIONES_PUSH)) {
            throw new BusinessException(
                    "Para recibir notificaciones push primero acepta el consentimiento NOTIFICACIONES_PUSH");
        }
        boolean creada = suscripcionRepository.upsert(usuario.getId(), req.endpoint(),
                req.keys().p256dh(), req.keys().auth(), req.userAgent());
        SuscripcionPush guardada = suscripcionRepository.findByEndpoint(req.endpoint())
                .orElseThrow(() -> new IllegalStateException("Upsert sin fila para el endpoint"));
        aplicarTope(usuario.getId(), guardada.getId());
        return new ResultadoSuscripcion(creada, SuscripcionPushResponse.desde(guardada));
    }

    /**
     * Tope de suscripciones por usuario: deja las {@code maxPorUsuario} mas
     * recientemente registradas (la recien dada de alta siempre se queda) y
     * borra el resto. Se elige desalojar en vez de responder 409 porque el
     * usuario no puede limpiar a mano las de navegadores que ya no usa (no
     * tiene su endpoint): un 409 lo dejaria sin push en el dispositivo nuevo.
     */
    private void aplicarTope(Long usuarioId, Long recienRegistradaId) {
        List<SuscripcionPush> otras = suscripcionRepository
                .findByUsuarioIdOrderByUpdatedAtDescIdDesc(usuarioId).stream()
                .filter(s -> !s.getId().equals(recienRegistradaId))
                .toList();
        int cupoOtras = maxPorUsuario - 1;
        if (otras.size() > cupoOtras) {
            suscripcionRepository.deleteAll(otras.subList(cupoOtras, otras.size()));
        }
    }

    /**
     * Baja de la suscripcion de este navegador. Solo las propias: la de otro
     * usuario responde 404, igual que una inexistente, para que nadie borre
     * lo ajeno. (No pretende ocultar que el endpoint existe: el POST ya lo
     * delata con 200 frente a 201; el endpoint es una URL de capacidad que
     * solo conoce quien tiene el navegador.) Se borra la fila, no se marca
     * inactiva: tras la baja no hay razon para conservar las claves.
     */
    @Transactional
    public void darDeBaja(String email, String endpoint) {
        Usuario usuario = usuarioConsultaService.usuarioPorEmail(email);
        SuscripcionPush suscripcion = suscripcionRepository
                .findByEndpointAndUsuarioId(endpoint, usuario.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Suscripcion no encontrada"));
        suscripcionRepository.delete(suscripcion);
    }

    /**
     * Borra todas las suscripciones del usuario. Lo invoca el listener
     * {@code AFTER_COMMIT} de la revocacion de {@code NOTIFICACIONES_PUSH}
     * (D-12), por eso abre su propia transaccion: sin permiso no se conservan
     * las claves de envio.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int eliminarTodasDelUsuario(Long usuarioId) {
        return suscripcionRepository.borrarDeUsuario(usuarioId);
    }

    /**
     * Clave publica VAPID para {@code pushManager.subscribe} (US-21). Es
     * publica por definicion: el navegador la necesita antes de suscribirse.
     * Si el servidor no tiene claves configuradas, 404: el frontend no ofrece
     * push.
     */
    public ClavePublicaVapidResponse clavePublicaVapid() {
        return enviadorWebPush.clavePublica()
                .map(ClavePublicaVapidResponse::new)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Las notificaciones push no estan configuradas en este servidor"));
    }
}
