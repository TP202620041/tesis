package pe.edu.upc.viasegura.auth.event;

/**
 * Se cerraron las sesiones de un usuario en todos sus dispositivos: a pedido
 * (US-04 Esc. 2, {@code AuthService}) o al restablecer la contrasena (US-03,
 * {@code PasswordResetService}). Se publica al subir la version de sesion; se atiende
 * despues del commit para que los modulos que guardan algo por dispositivo
 * reaccionen sin que {@code auth} los conozca: {@code notificaciones} borra
 * las suscripciones push del usuario, para que un dispositivo con la sesion
 * revocada deje de recibir avisos.
 */
public record SesionesCerradasEvent(Long usuarioId) {}
