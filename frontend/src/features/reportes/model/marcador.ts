import { estiloDeEstado } from '@/lib/types/estados';
import { tituloVisible } from '@/lib/types/tituloYSeveridad';
import type { ReporteResumen } from './tipos';

/**
 * QA-1 M-7: nombre accesible de un marcador del mapa publico.
 *
 * Leaflet hace de cada marcador un `div role="button" tabindex="0"` (para
 * abrir su popup con el teclado) pero sin nombre: un lector de pantalla
 * anunciaba «botón» decenas de veces sin decir de que reporte. Lleva lo que
 * distingue un marcador de otro: titulo, estado (que en el mapa solo se ve
 * por el color) y tipo de daño. Va en frases separadas por punto para que el
 * lector haga la pausa; tambien se ve como sugerencia al pasar el raton.
 */
export function nombreDeMarcador(
  reporte: Pick<ReporteResumen, 'titulo' | 'estado' | 'categoriaNombre'>,
): string {
  const partes = [
    tituloVisible(reporte.titulo),
    `Estado: ${estiloDeEstado(reporte.estado ?? '').etiqueta.toLowerCase()}`,
  ];
  const tipo = reporte.categoriaNombre?.trim();
  if (tipo) partes.push(`Tipo: ${tipo}`);
  return partes.join('. ');
}
