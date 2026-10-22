/**
 * QA-1 M-11: id de un reporte tal como llega en la URL (`/reportes/[id]`,
 * `/mis-reportes/[id]`, `/bandeja/[id]`), o `null` si no es un entero
 * positivo.
 *
 * Se valida ANTES de llamar al API. `Number('abc')` es `NaN`, y la peticion a
 * `/api/reportes/NaN` no coincide con la ruta publica del backend, que la
 * trata como protegida: sin sesion responde 401 y el cliente HTTP mandaba al
 * login a quien solo abrio un enlace roto. Con un id invalido la pantalla
 * dice «Reporte no disponible» sin preguntar nada.
 *
 * Solo digitos, sin signo, espacios, decimales ni ceros a la izquierda
 * (`Number` aceptaria `' 7 '`, `'7.0'` o `'0x7'`), y dentro de lo que un
 * `number` representa exacto.
 */
export function idDeRuta(texto: string | null | undefined): number | null {
  if (!texto || !/^[1-9]\d*$/.test(texto)) return null;
  const id = Number(texto);
  return Number.isSafeInteger(id) ? id : null;
}
