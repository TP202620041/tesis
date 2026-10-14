package pe.edu.upc.viasegura.notificaciones.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.notificaciones.domain.SuscripcionPush;
import pe.edu.upc.viasegura.notificaciones.dto.SuscripcionPushRequest;
import pe.edu.upc.viasegura.notificaciones.dto.SuscripcionPushResponse;
import pe.edu.upc.viasegura.notificaciones.repository.SuscripcionPushRepository;

/**
 * Suscripciones Web Push de los navegadores (SUSCRIPCION_PUSH, NC-07).
 *
 * <p>Solo registra y da de baja; el envio real es US-21. Mientras tanto,
 * {@code PushNotificacionAdapter} ya consulta estas filas para decidir si el
 * canal PUSH esta disponible.</p>
 */
@Service
@RequiredArgsConstructor
public class SuscripcionPushService {

    private final SuscripcionPushRepository suscripcionRepository;
    private final UsuarioConsultaService usuarioConsultaService;

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
     * Reclamar un endpoint ajeno exige conocerlo, y es una URL de capacidad
     * que el servicio de push genera al azar para ese navegador: quien la
     * tiene, en la practica, tiene el navegador.
     */
    @Transactional
    public ResultadoSuscripcion suscribir(String email, SuscripcionPushRequest req) {
        Usuario usuario = usuarioConsultaService.usuarioPorEmail(email);
        SuscripcionPush existente = suscripcionRepository.findByEndpoint(req.endpoint()).orElse(null);
        boolean creada = existente == null;
        SuscripcionPush suscripcion = creada
                ? SuscripcionPush.builder().endpoint(req.endpoint()).build()
                : existente;

        suscripcion.setUsuario(usuario);
        suscripcion.setP256dh(req.keys().p256dh());
        suscripcion.setAuth(req.keys().auth());
        suscripcion.setUserAgent(req.userAgent());
        suscripcion.setActiva(true);

        SuscripcionPush guardada = suscripcionRepository.saveAndFlush(suscripcion);
        return new ResultadoSuscripcion(creada, SuscripcionPushResponse.desde(guardada));
    }

    /**
     * Baja de la suscripcion de este navegador. Solo las propias: la de otro
     * usuario responde 404, igual que una inexistente, para no revelar que
     * ese endpoint esta registrado. Se borra la fila (no se marca inactiva):
     * tras la baja no hay razon para conservar las claves del navegador.
     */
    @Transactional
    public void darDeBaja(String email, String endpoint) {
        Usuario usuario = usuarioConsultaService.usuarioPorEmail(email);
        SuscripcionPush suscripcion = suscripcionRepository
                .findByEndpointAndUsuarioId(endpoint, usuario.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Suscripcion no encontrada"));
        suscripcionRepository.delete(suscripcion);
    }
}
