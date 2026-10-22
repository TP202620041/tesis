import type { components } from '@/lib/api/generated/schema';

/**
 * Fila del indice de desempeno, con la nulabilidad REAL del backend.
 *
 * El spec de springdoc marca estas metricas como `number | undefined`, pero
 * el endpoint envia `null` de verdad cuando no hay datos (distrito sin
 * reportes, sin resueltos o sin calificaciones): son columnas que la vista
 * materializada deja en NULL a proposito. Se corrigen aqui, igual que el
 * resto de refinamientos de `lib/types/domain.ts`, porque la diferencia
 * importa: `null` significa "esta metrica no aplica", no "cero".
 */
export type DesempenoDistrital = Omit<
  components['schemas']['DesempenoDistritalResponse'],
  'tasaResolucion' | 'tiempoPromedioHoras' | 'satisfaccionPromedio' | 'categoriaId'
> & {
  tasaResolucion?: number | null;
  tiempoPromedioHoras?: number | null;
  satisfaccionPromedio?: number | null;
  categoriaId?: number | null;
};

/**
 * Presentacion del indice de desempeno distrital (US-18/US-20).
 *
 * Escalas que entrega el backend (vista materializada, migracion V7), y que
 * hay que respetar al formatear:
 *   - `tasaResolucion`      porcentaje 0..100 (NO fraccion 0..1)
 *   - `tiempoPromedioHoras` horas
 *   - `satisfaccionPromedio` estrellas 1..5
 * Los tres son `null` cuando no hay datos suficientes, y **null no es cero**:
 * un distrito sin reportes no tiene una tasa del 0 %, no tiene tasa. Mezclar
 * ambos casos acusaria de mal desempeno a una municipalidad que simplemente
 * no recibio reportes.
 */

export const SIN_DATOS = 'Sin datos';

/** `35.5` -> `"35,5 %"`; `null` -> `"Sin datos"`. */
export function formatearTasa(tasa: number | null | undefined): string {
  if (tasa == null) return SIN_DATOS;
  return `${tasa.toLocaleString('es-PE', { maximumFractionDigits: 1 })} %`;
}

/** Lo que se muestra para un promedio de menos de una hora (QA-1 M-12). */
export const MENOS_DE_UNA_HORA = '< 1 h';

/**
 * Horas a una duracion legible: `5.5` -> `"5,5 h"`, `36` -> `"1 d 12 h"`.
 *
 * Por encima de un dia, las horas crudas dejan de decir algo ("847,25 h" no
 * se interpreta de un vistazo), que es justo lo que esta pantalla busca.
 *
 * Por debajo de una hora, «< 1 h» (QA-1 M-12): 0,01 h redondeaba a «0 h», que
 * se lee como cero o como «sin dato», cuando es la atencion mas rapida. Es
 * un dato real, no la ausencia de uno: `null` sigue siendo «Sin datos».
 */
export function formatearTiempo(horas: number | null | undefined): string {
  if (horas == null) return SIN_DATOS;
  if (horas < 1) return MENOS_DE_UNA_HORA;
  if (horas < 24) {
    return `${horas.toLocaleString('es-PE', { maximumFractionDigits: 1 })} h`;
  }
  const dias = Math.floor(horas / 24);
  const resto = Math.round(horas % 24);
  // 47,8 h redondea a 48: se muestra "2 d", no "1 d 24 h".
  if (resto === 24) return `${dias + 1} d`;
  return resto === 0 ? `${dias} d` : `${dias} d ${resto} h`;
}

/** `4.25` -> `"4,3 / 5"`; `null` -> `"Sin datos"`. */
export function formatearSatisfaccion(valor: number | null | undefined): string {
  if (valor == null) return SIN_DATOS;
  return `${valor.toLocaleString('es-PE', { maximumFractionDigits: 1 })} / 5`;
}

/** Ancho de la barra de la tasa, acotado a 0..100. */
export function anchoBarra(tasa: number | null | undefined): number {
  if (tasa == null) return 0;
  return Math.max(0, Math.min(100, tasa));
}

export type ColumnaOrden = 'tasa' | 'tiempo' | 'satisfaccion' | 'reportes' | 'distrito';

export interface Orden {
  columna: ColumnaOrden;
  descendente: boolean;
}

/** Orden por defecto: el mismo ranking que ya devuelve el backend. */
export const ORDEN_INICIAL: Orden = { columna: 'tasa', descendente: true };

function valorDe(fila: DesempenoDistrital, columna: ColumnaOrden): number | string | null {
  switch (columna) {
    case 'tasa':
      return fila.tasaResolucion ?? null;
    case 'tiempo':
      return fila.tiempoPromedioHoras ?? null;
    case 'satisfaccion':
      return fila.satisfaccionPromedio ?? null;
    case 'reportes':
      return fila.totalReportes ?? 0;
    case 'distrito':
      return fila.distritoNombre ?? '';
  }
}

/**
 * Ordena una copia por la columna indicada.
 *
 * <b>Los `null` van SIEMPRE al final</b>, se ordene ascendente o
 * descendentemente. Es deliberado: "sin datos" no es un valor extremo que
 * deba encabezar el ranking al invertir el orden — un distrito sin reportes
 * no es ni el mejor ni el peor, simplemente no participa de esa metrica.
 * Es el mismo criterio del `NULLS LAST` del backend.
 */
export function ordenar(filas: DesempenoDistrital[], orden: Orden): DesempenoDistrital[] {
  const copia = [...filas];
  return copia.sort((a, b) => {
    const va = valorDe(a, orden.columna);
    const vb = valorDe(b, orden.columna);

    if (va == null && vb == null) return comparaNombre(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;

    let cmp: number;
    if (typeof va === 'string' || typeof vb === 'string') {
      cmp = String(va).localeCompare(String(vb), 'es-PE');
    } else {
      cmp = va - vb;
    }
    if (cmp === 0) return comparaNombre(a, b);
    return orden.descendente ? -cmp : cmp;
  });
}

/** Desempate estable y predecible entre filas equivalentes. */
function comparaNombre(a: DesempenoDistrital, b: DesempenoDistrital): number {
  return (a.distritoNombre ?? '').localeCompare(b.distritoNombre ?? '', 'es-PE');
}

/**
 * Alterna el orden al pulsar una columna.
 *
 * Cada columna arranca en la direccion que su significado hace mas util:
 * tasa, satisfaccion y volumen de mayor a menor; tiempo de atencion de menor
 * a mayor (menos horas es mejor) y distrito alfabetico.
 */
export function alternarOrden(actual: Orden, columna: ColumnaOrden): Orden {
  if (actual.columna === columna) {
    return { columna, descendente: !actual.descendente };
  }
  const descendentePorDefecto = columna !== 'tiempo' && columna !== 'distrito';
  return { columna, descendente: descendentePorDefecto };
}
