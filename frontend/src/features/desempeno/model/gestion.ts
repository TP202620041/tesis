import type { components } from '@/lib/api/generated/schema';
import { MIN_REPORTES_DASHBOARD } from './dashboard';
import {
  DATOS_INSUFICIENTES,
  MIN_RESUELTOS_PARA_PROMEDIO,
  SIN_DATOS,
  type ColumnaOrden,
  type Orden,
} from './formato';

/**
 * NC-06 (indicador OE3-I5): desempeño de cada municipalidad por periodo de
 * gestión, de `GET /api/desempeno/periodos` y `GET /api/desempeno/gestion`.
 *
 * Fórmulas (decisión del 23/11, `2026-11-23-nc-06-kpis-gestion-y-d10.md`):
 *   - válidos: todos los reportes del distrito en el periodo salvo CANCELADO y
 *     ocultos por moderación (los RECHAZADO cuentan: SEC-01);
 *   - tasa = resueltos ÷ válidos × 100, dos decimales, `null` sin válidos;
 *   - tiempo = promedio de (resolución − creación) de los resueltos, en DÍAS
 *     con un decimal (el índice anterior usaba horas), `null` sin resueltos;
 *   - satisfacción = promedio de estrellas (1..5), `null` sin calificaciones.
 * Un reporte cuenta en el periodo de su creación.
 *
 * El servidor calcula; este modelo solo decide qué se muestra (umbrales de
 * «Datos insuficientes», `null` como «Sin datos») y cómo se ordena.
 */

type PeriodoGenerado = components['schemas']['PeriodoGestionResponse'];
type KpiGenerado = components['schemas']['KpiGestionDistritalResponse'];
type DashboardGenerado = components['schemas']['DashboardGestionResponse'];

/** Periodo de gestión con la nulabilidad real (ningún campo es nulo). */
export type PeriodoGestion = Required<PeriodoGenerado>;

/**
 * Fila de una municipalidad. springdoc marca todo como opcional; aquí va la
 * nulabilidad real del contrato: los conteos nunca son nulos y las métricas
 * son `null` cuando no hay con qué calcularlas (null no es cero).
 */
export type KpiGestion = Required<
  Omit<
    KpiGenerado,
    'municipalidadNombre' | 'categoriaId' | 'tasaResolucion' | 'tiempoPromedioDias' | 'satisfaccionPromedio'
  >
> & {
  municipalidadNombre: string | null;
  categoriaId: number | null;
  tasaResolucion: number | null;
  tiempoPromedioDias: number | null;
  satisfaccionPromedio: number | null;
};

export type DashboardGestion = Omit<Required<DashboardGenerado>, 'periodo' | 'categoriaId' | 'calculatedAt' | 'distritos'> & {
  periodo: PeriodoGestion;
  categoriaId: number | null;
  calculatedAt: string | null;
  distritos: KpiGestion[];
};

/** US-17 Esc. 2: con menos válidos, la tasa y la satisfacción no se muestran. */
export const MIN_VALIDOS = MIN_REPORTES_DASHBOARD;
/** US-20 Esc. 2: con menos resueltos, el tiempo promedio no se muestra. */
export const MIN_RESUELTOS = MIN_RESUELTOS_PARA_PROMEDIO;

// ---------------------------------------------------------------- periodos

function partesDeFecha(iso: string): { anio: string; mes: string; dia: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? { anio: m[1]!, mes: m[2]!, dia: m[3]! } : null;
}

/**
 * `2023-01-01 → 2026-12-31` → «2023–2026». Un periodo que no va de enero a
 * diciembre se muestra con sus fechas (`01/07/2023 – 30/06/2027`). Se lee el
 * texto, no un `Date`: `new Date('2023-01-01')` es medianoche UTC, que en Lima
 * todavía es el 31 de diciembre.
 */
export function etiquetaPeriodo(periodo: Pick<PeriodoGestion, 'fechaInicio' | 'fechaFin'>): string {
  const inicio = partesDeFecha(periodo.fechaInicio);
  const fin = partesDeFecha(periodo.fechaFin);
  if (!inicio || !fin) return `${periodo.fechaInicio} – ${periodo.fechaFin}`;
  if (inicio.mes === '01' && inicio.dia === '01' && fin.mes === '12' && fin.dia === '31') {
    return `${inicio.anio}–${fin.anio}`;
  }
  return `${inicio.dia}/${inicio.mes}/${inicio.anio} – ${fin.dia}/${fin.mes}/${fin.anio}`;
}

/** Texto de la opción del selector: marca el vigente con palabras, no solo con la selección. */
export function opcionDePeriodo(periodo: PeriodoGestion): string {
  return `${etiquetaPeriodo(periodo)}${periodo.vigente ? ' (vigente)' : ''}`;
}

/**
 * Periodo que se consulta: el de la URL si existe; si no, el vigente; si
 * ninguno contiene hoy, el más reciente (la lista viene así ordenada).
 */
export function periodoElegido(periodos: readonly PeriodoGestion[], idEnUrl: number | null): PeriodoGestion | null {
  return (
    (idEnUrl != null ? periodos.find((p) => p.id === idEnUrl) : undefined) ??
    periodos.find((p) => p.vigente) ??
    periodos[0] ??
    null
  );
}

// ------------------------------------------------------- datos insuficientes

/** La tasa existe pero sale de menos de {@link MIN_VALIDOS} reportes válidos. */
export function tasaInsuficiente(fila: KpiGestion): boolean {
  return fila.tasaResolucion != null && fila.reportesValidos < MIN_VALIDOS;
}

/** La satisfacción existe pero el distrito tiene menos de {@link MIN_VALIDOS} válidos. */
export function satisfaccionInsuficiente(fila: KpiGestion): boolean {
  return fila.satisfaccionPromedio != null && fila.reportesValidos < MIN_VALIDOS;
}

/** El tiempo existe pero sale de menos de {@link MIN_RESUELTOS} resueltos. */
export function tiempoInsuficiente(fila: KpiGestion): boolean {
  return fila.tiempoPromedioDias != null && fila.reportesResueltos < MIN_RESUELTOS;
}

/** Tasa que se puede mostrar y comparar: `null` si no hay o no es representativa. */
export function tasaRepresentativa(fila: KpiGestion | null | undefined): number | null {
  if (!fila || tasaInsuficiente(fila)) return null;
  return fila.tasaResolucion;
}

function tiempoRepresentativo(fila: KpiGestion): number | null {
  return tiempoInsuficiente(fila) ? null : fila.tiempoPromedioDias;
}

function satisfaccionRepresentativa(fila: KpiGestion): number | null {
  return satisfaccionInsuficiente(fila) ? null : fila.satisfaccionPromedio;
}

// ------------------------------------------------------------------ formato

function decimal(n: number, maximo: number): string {
  return n.toLocaleString('es-PE', { maximumFractionDigits: maximo });
}

/**
 * Tasa con los dos decimales del servidor: `66.67` → «66.67 %». Se muestran
 * los dos para que la cifra coincida con el cálculo manual (OE3-I5).
 */
export function formatearTasaGestion(tasa: number | null | undefined): string {
  if (tasa == null) return SIN_DATOS;
  return `${decimal(tasa, 2)} %`;
}

/** Lo que se muestra para un promedio que redondeó a 0,0 días (menos de ~1 h). */
export const MENOS_DE_UN_DECIMO_DE_DIA = '< 0.1 días';

/**
 * Días con un decimal: `1.9` → «1.9 días», `1` → «1 día». Un `0` del servidor
 * (se resolvió en poco más de una hora o menos) dice «< 0.1 días», no
 * «0 días», que se leería como cero o falta de dato (mismo criterio que el
 * «< 1 h» de QA-1 M-12). `null` es «Sin datos».
 */
export function formatearDias(dias: number | null | undefined): string {
  if (dias == null) return SIN_DATOS;
  if (dias < 0.05) return MENOS_DE_UN_DECIMO_DE_DIA;
  const texto = decimal(dias, 1);
  return texto === '1' ? '1 día' : `${texto} días`;
}

/** `4.25` → «4.25 / 5». */
export function formatearSatisfaccionGestion(valor: number | null | undefined): string {
  if (valor == null) return SIN_DATOS;
  return `${decimal(valor, 2)} / 5`;
}

function derivada(valor: number | null, insuficiente: boolean, formatear: (v: number) => string): string {
  if (valor == null) return SIN_DATOS;
  return insuficiente ? DATOS_INSUFICIENTES : formatear(valor);
}

/** Tasa de una fila, con «Sin datos» (null) y «Datos insuficientes» (< 5 válidos). */
export function textoTasa(fila: KpiGestion | null | undefined): string {
  if (!fila) return SIN_DATOS;
  return derivada(fila.tasaResolucion, tasaInsuficiente(fila), formatearTasaGestion);
}

/** Tiempo promedio de una fila, con «Datos insuficientes» si hay < 3 resueltos. */
export function textoTiempo(fila: KpiGestion | null | undefined): string {
  if (!fila) return SIN_DATOS;
  return derivada(fila.tiempoPromedioDias, tiempoInsuficiente(fila), formatearDias);
}

/** Satisfacción de una fila, con «Datos insuficientes» si hay < 5 válidos. */
export function textoSatisfaccion(fila: KpiGestion | null | undefined): string {
  if (!fila) return SIN_DATOS;
  return derivada(fila.satisfaccionPromedio, satisfaccionInsuficiente(fila), formatearSatisfaccionGestion);
}

/**
 * «resueltos / válidos». Son hechos, no promedios: se muestran aunque los
 * datos sean insuficientes. Sin fila (un tipo de daño sin reportes en ese
 * distrito) no se afirma «0 / 0».
 */
export function textoConteo(fila: KpiGestion | null | undefined): string {
  if (!fila) return SIN_DATOS;
  return `${fila.reportesResueltos.toLocaleString('es-PE')} / ${fila.reportesValidos.toLocaleString('es-PE')}`;
}

/** Nombre de la municipalidad solo si dice algo más que el del distrito. */
export function municipalidadDistinta(fila: KpiGestion): string | null {
  const nombre = fila.municipalidadNombre?.trim();
  return nombre && nombre !== fila.distritoNombre ? nombre : null;
}

/**
 * `true` si el periodo (con el filtro elegido) no tiene ningún reporte
 * válido: el periodo 2027-2030 antes de empezar, o un tipo de daño que nadie
 * reportó. La pantalla dice «Sin datos» en vez de 43 filas de ceros.
 */
export function periodoSinDatos(dashboard: Pick<DashboardGestion, 'distritos'>): boolean {
  return dashboard.distritos.every((f) => f.reportesValidos === 0);
}

// -------------------------------------------------------------------- orden

/**
 * Valor de la fila en la columna de orden. Tasa, tiempo y satisfacción con
 * datos insuficientes valen `null`: un distrito con 1 reporte resuelto de 1
 * no encabeza el ranking con un 100 %.
 */
export function valorParaOrden(fila: KpiGestion, columna: ColumnaOrden): number | string | null {
  switch (columna) {
    case 'tasa':
      return tasaRepresentativa(fila);
    case 'tiempo':
      return tiempoRepresentativo(fila);
    case 'satisfaccion':
      return satisfaccionRepresentativa(fila);
    case 'reportes':
      return fila.reportesValidos;
    case 'distrito':
      return fila.distritoNombre;
  }
}

function comparaNombre(a: KpiGestion, b: KpiGestion): number {
  return a.distritoNombre.localeCompare(b.distritoNombre, 'es-PE');
}

/**
 * Ordena una copia. Los `null` (sin datos o con datos insuficientes) van
 * SIEMPRE al final, en las dos direcciones, como el `NULLS LAST` del
 * backend: no son el mejor ni el peor, no participan de esa métrica. Empates
 * por nombre, para un orden estable.
 */
export function ordenarGestion(filas: readonly KpiGestion[], orden: Orden): KpiGestion[] {
  return [...filas].sort((a, b) => {
    const va = valorParaOrden(a, orden.columna);
    const vb = valorParaOrden(b, orden.columna);
    if (va == null && vb == null) return comparaNombre(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp =
      typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb), 'es-PE')
        : va - vb;
    if (cmp === 0) return comparaNombre(a, b);
    return orden.descendente ? -cmp : cmp;
  });
}

/**
 * Posición en el ranking (1, 2, …) o `null` si la fila no tiene valor en la
 * columna de orden: «#43» le atribuiría el último puesto a un distrito que
 * no participa de la métrica. `ordenadas` es la salida de {@link ordenarGestion}.
 */
export function posiciones(ordenadas: readonly KpiGestion[], orden: Orden): (number | null)[] {
  return ordenadas.map((fila, i) => (valorParaOrden(fila, orden.columna) == null ? null : i + 1));
}
