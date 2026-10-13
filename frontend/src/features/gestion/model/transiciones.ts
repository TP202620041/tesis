import type { EstadoReporte } from '@/lib/types/domain';

/**
 * Transiciones de estado que la bandeja municipal ofrece (US-14).
 *
 * ---------------------------------------------------------------------------
 * ESTO DUPLICA LOGICA DEL BACKEND, A PROPOSITO Y CON LIMITES CLAROS
 * ---------------------------------------------------------------------------
 * La autoridad sobre que transiciones son validas es
 * `EstadoReporte.puedeTransicionarA` en el backend, que responde 409 ante una
 * invalida. Esta tabla existe solo como ayuda de interfaz: sin ella habria
 * que ofrecer los seis estados y dejar que el funcionario descubra por ensayo
 * y error cuales fallan.
 *
 * El riesgo de que las dos se separen se acepta porque: (a) son seis estados
 * con reglas triviales que cambian rara vez, a diferencia de la geometria de
 * distritos, donde SI se evito duplicar; (b) si esta tabla se queda corta, el
 * peor caso es ofrecer una opcion de mas y mostrar el 409 del backend con un
 * mensaje claro — nunca aplicar una transicion que el backend rechazaria.
 *
 * DIFERENCIA DELIBERADA CON EL BACKEND: aqui NO se ofrece CANCELADO. Cancelar
 * es la retirada del ciudadano sobre su propio reporte (US-08, via
 * `DELETE /api/reportes/{id}`), no una decision municipal. Si un funcionario
 * quiere descartar un reporte, la via es RECHAZADO, que exige comentario y
 * queda auditado como decision de la municipalidad.
 */

const TRANSICIONES_MUNICIPALES: Record<EstadoReporte, readonly EstadoReporte[]> = {
  PENDIENTE: ['RECIBIDO', 'RECHAZADO'],
  RECIBIDO: ['EN_PROCESO', 'RECHAZADO'],
  EN_PROCESO: ['RESUELTO', 'RECHAZADO'],
  RESUELTO: [],
  RECHAZADO: [],
  CANCELADO: [],
};

/** Estados a los que el funcionario puede llevar un reporte desde `actual`. */
export function transicionesDesde(actual: string): readonly EstadoReporte[] {
  return TRANSICIONES_MUNICIPALES[actual as EstadoReporte] ?? [];
}

/** `true` si el reporte ya no admite cambios de estado. */
export function esTerminal(estado: string): boolean {
  return transicionesDesde(estado).length === 0;
}

/**
 * `true` si ese destino exige comentario.
 *
 * El backend responde 400 si se rechaza sin justificar; el formulario lo
 * exige antes de enviar para que el funcionario no pierda lo escrito ni
 * descubra el requisito con un error.
 */
export function exigeComentario(destino: string): boolean {
  return destino === 'RECHAZADO';
}

/**
 * Estados en los que se puede asignar responsable (US-15).
 *
 * El backend lo valida (`ESTADOS_ASIGNABLES`, 409 si no): antes de RECIBIDO
 * la municipalidad todavia no tomo el reporte, y despues de resolverlo o
 * rechazarlo ya no hay trabajo que asignar.
 */
export function admiteResponsable(estado: string): boolean {
  return estado === 'RECIBIDO' || estado === 'EN_PROCESO';
}
