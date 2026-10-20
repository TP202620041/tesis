/**
 * NC-07b (D-12): version de los terminos de uso y la politica de privacidad
 * que muestra esta app.
 *
 * **Por que una constante y no un dato del API.** El registro (US-01) ocurre
 * sin sesion, y el contrato no expone la version vigente en ninguna ruta
 * publica: solo llega con sesion (`ConsentimientosResponse.versionTerminosVigente`).
 * Asi que el formulario de registro y la pagina `/privacidad` usan esta
 * constante, y con sesion (pantalla de aceptacion, perfil) se usa la del API.
 *
 * **Debe coincidir con `app.legal.version-terminos` del backend**
 * (`backend/src/main/resources/application.yml`) y con el texto de
 * `features/legal/`. Lo comprueba `terminos.test.ts`, que lee ese archivo
 * del backend. Si se publica un texto nuevo: cambiar el texto, esta
 * constante y la propiedad del backend en la misma entrega. Si quedaran
 * desfasadas, el registro responde 409 y el formulario lo explica (ver
 * {@link esVersionDeTerminosNoVigente}); no se crea ninguna cuenta.
 */
export const VERSION_TERMINOS = '2026-10-v1';

/**
 * `true` si el 409 del registro es por la version de los terminos (el texto
 * de este cliente quedo viejo) y no, por ejemplo, por un correo ya
 * registrado.
 *
 * El backend no manda un `codigo` para este caso, asi que se reconoce por
 * su mensaje («La version de los terminos aceptada no es la vigente…»). Si
 * el mensaje cambiara, el peor caso es mostrar el mensaje del backend sin la
 * explicacion extra.
 */
export function esVersionDeTerminosNoVigente(status: number, mensaje: string): boolean {
  return status === 409 && /t[eé]rminos/i.test(mensaje);
}
