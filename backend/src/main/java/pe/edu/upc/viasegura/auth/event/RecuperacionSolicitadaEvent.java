package pe.edu.upc.viasegura.auth.event;

/**
 * Se creo un token de recuperacion de contrasena (US-03, DEP-08). Lo publica
 * {@code PasswordResetService#solicitarRecuperacion}; el correo lo envia
 * {@code RecuperacionSolicitadaListener} despues del commit y fuera de la
 * peticion.
 *
 * <p>Lleva solo el <b>id</b> del token: identifica cual enviar aunque la
 * cuenta tenga varios vigentes, y el valor del token nunca viaja en un evento,
 * que puede terminar en un log.</p>
 */
public record RecuperacionSolicitadaEvent(Long tokenId) {}
