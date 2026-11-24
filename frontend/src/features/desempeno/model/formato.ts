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

/**
 * «Datos insuficientes» (US-17 Esc. 2, US-20 Esc. 2): la métrica existe pero
 * sale de tan pocos reportes que no dice nada del distrito. Distinto de «Sin
 * datos» (`null`: no hay métrica). Con menos de
 * {@link MIN_RESUELTOS_PARA_PROMEDIO} resueltos, el tiempo promedio no es
 * representativo; las reglas del índice por periodo están en `gestion.ts`
 * (NC-06) y las del dashboard del funcionario, en `dashboard.ts`.
 */
export const DATOS_INSUFICIENTES = 'Datos insuficientes';
export const MIN_RESUELTOS_PARA_PROMEDIO = 3;

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

/**
 * Orden por defecto: el mismo ranking que ya devuelve el backend. El orden
 * en si (`ordenarGestion`, con los `null` siempre al final) esta en `gestion.ts`.
 */
export const ORDEN_INICIAL: Orden = { columna: 'tasa', descendente: true };

/**
 * Alterna el orden al pulsar una columna.
 *
 * Cada columna arranca en la direccion que su significado hace mas util:
 * tasa, satisfaccion y volumen de mayor a menor; tiempo de atencion de menor
 * a mayor (menos tiempo es mejor) y distrito alfabetico.
 */
export function alternarOrden(actual: Orden, columna: ColumnaOrden): Orden {
  if (actual.columna === columna) {
    return { columna, descendente: !actual.descendente };
  }
  const descendentePorDefecto = columna !== 'tiempo' && columna !== 'distrito';
  return { columna, descendente: descendentePorDefecto };
}
