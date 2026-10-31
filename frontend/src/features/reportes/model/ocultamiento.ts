/**
 * NC-11b (D-15): que tiene oculto un reporte propio, deducido de su linea de
 * tiempo. `ReporteResumenResponse` no gana campos (contrato de NC-11a): el
 * creador sigue viendo su reporte oculto en «Mis reportes» (sin foto), y la
 * unica señal que recibe es el par de eventos `REPORTE_OCULTO` /
 * `REPORTE_RESTABLECIDO` (y `FOTO_OCULTA` / `FOTO_RESTABLECIDA`) del
 * historial, que el backend entrega en orden cronologico. El ultimo evento
 * de cada par decide.
 *
 * Regla pura; la usa `DetalleMiReporte` para explicar por que el reporte no
 * se ve en el mapa (o por que no tiene foto) sin decir nada de quien
 * denuncio: el historial que llega al creador ya viene redactado.
 */
import type { HistorialEntrada } from '@/lib/types/domain';

export interface EstadoDeOcultamiento {
  /** El reporte entero esta oculto: no esta en el mapa, el detalle publico da 404. */
  reporteOculto: boolean;
  /** Solo la foto esta oculta: el reporte sigue publico, sin su foto. */
  fotoOculta: boolean;
}

export const SIN_OCULTAMIENTO: EstadoDeOcultamiento = { reporteOculto: false, fotoOculta: false };

export function estadoDeOcultamiento(entradas: readonly HistorialEntrada[]): EstadoDeOcultamiento {
  let reporteOculto = false;
  let fotoOculta = false;
  for (const entrada of entradas) {
    switch (entrada.tipoEvento) {
      case 'REPORTE_OCULTO':
        reporteOculto = true;
        break;
      case 'REPORTE_RESTABLECIDO':
        reporteOculto = false;
        break;
      case 'FOTO_OCULTA':
        fotoOculta = true;
        break;
      case 'FOTO_RESTABLECIDA':
        fotoOculta = false;
        break;
      default:
        break;
    }
  }
  return { reporteOculto, fotoOculta };
}

/** Lo que se le dice al creador; el porque esta en el seguimiento. */
export const AVISO_REPORTE_OCULTO =
  'Este reporte está oculto por moderación: no aparece en el mapa ni en la vista pública y no cuenta en el índice de desempeño. El motivo está en el seguimiento.';

export const AVISO_FOTO_OCULTA =
  'La foto de este reporte está oculta por moderación: el reporte sigue público, pero sin su foto. El motivo está en el seguimiento.';

/** Cuando el reporte no trae foto (nunca la tuvo, o esta oculta). */
export const SIN_FOTO = 'Este reporte no tiene foto.';
