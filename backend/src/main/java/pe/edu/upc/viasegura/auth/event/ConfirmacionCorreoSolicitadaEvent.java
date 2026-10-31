package pe.edu.upc.viasegura.auth.event;

/**
 * Se pidio un enlace de confirmacion del correo (NC-09): al registrarse o al
 * pedir que se reenvie. Lo publica {@code ConfirmacionCorreoService}; el
 * correo lo envia {@code ConfirmacionCorreoSolicitadaListener} despues del
 * commit y fuera de la peticion.
 *
 * <p>Lleva solo el <b>id</b> de la fila del token, igual que
 * {@link RecuperacionSolicitadaEvent}. Aqui el token ni siquiera existe
 * todavia: lo genera el hilo que envia el correo, que guarda solo su hash.</p>
 */
public record ConfirmacionCorreoSolicitadaEvent(Long tokenId) {}
