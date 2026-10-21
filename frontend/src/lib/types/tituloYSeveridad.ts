import { esSeveridad, type Severidad } from '@/lib/types/domain';

/**
 * NC-02: como se muestran el titulo y la severidad de un reporte. Vive en
 * `lib/types` (y no en una feature) porque lo usan `reportes` (mapa, lista,
 * detalle, mis reportes) y `gestion` (bandeja), como `estados.ts`.
 */

const ETIQUETAS: Record<Severidad, string> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
};

/** Las tres severidades, de menor a mayor, con su etiqueta (para los selectores). */
export const OPCIONES_DE_SEVERIDAD: readonly { valor: Severidad; etiqueta: string }[] = (
  Object.keys(ETIQUETAS) as Severidad[]
).map((valor) => ({ valor, etiqueta: ETIQUETAS[valor] }));

/**
 * Etiqueta de una severidad, o `null` si no hay (respuesta idempotente
 * anterior a NC-02) o no se reconoce: la UI la omite en vez de romper, como
 * `estiloDeEstado` con un estado desconocido.
 */
export function etiquetaDeSeveridad(valor: string | null | undefined): string | null {
  return esSeveridad(valor) ? ETIQUETAS[valor] : null;
}

/** «Severidad alta», para listas y detalles; `null` si no hay severidad. */
export function textoDeSeveridad(valor: string | null | undefined): string | null {
  const etiqueta = etiquetaDeSeveridad(valor);
  return etiqueta ? `Severidad ${etiqueta.toLowerCase()}` : null;
}

/** Lo que se muestra cuando un reporte llega sin titulo. */
export const SIN_TITULO = 'Sin título';

/**
 * Titulo para mostrar. Solo puede faltar en la respuesta idempotente de un
 * envio procesado antes de NC-02; los reportes existentes los relleno V17.
 */
export function tituloVisible(titulo: string | null | undefined): string {
  const limpio = titulo?.trim();
  return limpio ? limpio : SIN_TITULO;
}
