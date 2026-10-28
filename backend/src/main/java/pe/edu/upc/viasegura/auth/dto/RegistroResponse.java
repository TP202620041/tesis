package pe.edu.upc.viasegura.auth.dto;

/**
 * Respuesta 201 del registro (US-01) desde NC-09. La cuenta nace sin
 * confirmar, asi que el registro <b>ya no inicia sesion</b> ni devuelve un
 * token: devuelve lo que la PWA necesita para mostrar «revisa tu correo».
 *
 * @param email               el correo al que se envio el enlace, tal como
 *                            quedo registrado.
 * @param vigenciaEnlaceHoras cuantas horas vale el enlace (24).
 */
public record RegistroResponse(String email, long vigenciaEnlaceHoras) {}
