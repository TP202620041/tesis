/**
 * Que puede hacer el CIUDADANO con un reporte propio, segun su estado.
 *
 * Igual que `features/gestion/model/transiciones.ts` para el funcionario, esto es
 * una ayuda de interfaz: la autoridad sigue siendo el backend, que responde
 * 403 (no eres el creador) o 409 (el estado no lo permite). Sirve para no
 * ofrecer botones que van a fallar.
 *
 * Las reglas son deliberadamente mas estrechas que las del funcionario, y
 * cada una viene de una decision ya tomada en el backend:
 *   - Editar y cancelar solo mientras el reporte siga PENDIENTE (US-08):
 *     una vez que la municipalidad lo recibe, hay trabajo comprometido y el
 *     ciudadano ya no puede retirarlo unilateralmente.
 *   - Calificar solo cuando esta RESUELTO (US-26): se evalua la atencion
 *     recibida, y antes de resolverlo no hay atencion que evaluar.
 */

/** US-08: el creador edita categoria y descripcion mientras sigue PENDIENTE. */
export function puedeEditar(estado: string): boolean {
  return estado === 'PENDIENTE';
}

/** US-08: el creador retira su reporte mientras sigue PENDIENTE. */
export function puedeCancelar(estado: string): boolean {
  return estado === 'PENDIENTE';
}

/** US-26: se califica la atencion de un reporte ya resuelto. */
export function puedeCalificar(estado: string): boolean {
  return estado === 'RESUELTO';
}

/**
 * `true` si el reporte tiene vista publica (`/reportes/[id]`). QA-1 M-13: un
 * reporte CANCELADO no la tiene (el backend responde 404 a cualquiera: lo
 * retiro su creador antes de que entrara al flujo municipal), asi que no se
 * ofrece el enlace «Ver cómo lo ven los demás», que llevaba a «Reporte no
 * disponible».
 */
export function tieneVistaPublica(estado: string): boolean {
  return estado !== 'CANCELADO';
}

/**
 * `true` si el reporte ya no puede cambiar por accion de nadie.
 *
 * Util para explicarle al ciudadano por que no hay acciones disponibles, en
 * vez de mostrarle una pantalla sin botones y sin motivo.
 */
export function esTerminal(estado: string): boolean {
  return estado === 'RESUELTO' || estado === 'RECHAZADO' || estado === 'CANCELADO';
}

/**
 * Texto que explica en que punto va el reporte, desde la perspectiva del
 * vecino que lo envio (no la del funcionario que lo gestiona).
 */
export function explicacionDeEstado(estado: string): string {
  switch (estado) {
    case 'PENDIENTE':
      return 'Tu reporte fue enviado y espera que la municipalidad lo revise. Mientras tanto puedes editarlo o retirarlo.';
    case 'RECIBIDO':
      return 'La municipalidad ya registró tu reporte. A partir de aquí no puedes editarlo ni retirarlo.';
    case 'EN_PROCESO':
      return 'La municipalidad está trabajando en la reparación.';
    case 'RESUELTO':
      // Sin «Puedes calificar…» (QA-1 M-13): esa invitacion la hace el
      // formulario de calificacion, que desaparece al calificar; aqui
      // quedaba escrita tambien despues.
      return 'La municipalidad marcó el daño como reparado.';
    case 'RECHAZADO':
      return 'La municipalidad desestimó el reporte. Revisa el historial para ver el motivo.';
    case 'CANCELADO':
      return 'Retiraste este reporte, así que la municipalidad no lo gestionará.';
    default:
      return 'Estado no reconocido.';
  }
}
