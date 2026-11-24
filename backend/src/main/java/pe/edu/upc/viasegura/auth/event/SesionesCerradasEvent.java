package pe.edu.upc.viasegura.auth.event;

/**
 * Un usuario cerro la sesion en todos sus dispositivos (US-04 Esc. 2). Lo
 * publica {@code AuthService} al subir la version de sesion; se atiende
 * despues del commit para que los modulos que guardan algo por dispositivo
 * reaccionen sin que {@code auth} los conozca: {@code notificaciones} borra
 * las suscripciones push del usuario, para que un dispositivo con la sesion
 * revocada deje de recibir avisos.
 */
public record SesionesCerradasEvent(Long usuarioId) {}
