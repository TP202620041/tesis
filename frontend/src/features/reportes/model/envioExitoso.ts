import type { ReporteCreado } from './tipos';

/**
 * US-06 Esc. 2: lo que se le dice al ciudadano cuando la cola offline envía
 * sola reportes que había guardado sin conexión. Regla pura: el hook junta
 * los enviados de cada vuelta y el componente solo pinta este texto.
 *
 * Un reenvío puede terminar en adhesión (US-09: ya había un reporte activo de
 * la misma categoría a ≤ 20 m): entonces no se creó un reporte nuevo, se sumó
 * su apoyo al existente, y decir «se envió tu reporte» sin más sería inexacto.
 */
export interface AvisoDeEnvioExitoso {
  texto: string;
  enlace: { href: string; texto: string };
}

/** Donde el ciudadano ve lo que se acaba de enviar. */
export const RUTA_MIS_REPORTES = '/mis-reportes';

export function avisoDeEnvioExitoso(enviados: readonly ReporteCreado[]): AvisoDeEnvioExitoso | null {
  if (enviados.length === 0) return null;

  if (enviados.length === 1) {
    const [unico] = enviados as [ReporteCreado];
    if (unico.esAdhesion) {
      return {
        texto:
          'Se envió el reporte que guardaste sin conexión. Ya había un reporte de ese daño en el mismo lugar, así que se sumó tu apoyo a ese reporte.',
        enlace: { href: RUTA_MIS_REPORTES, texto: 'Ver en Mis reportes' },
      };
    }
    return {
      texto: 'Se envió el reporte que guardaste sin conexión.',
      enlace: { href: `${RUTA_MIS_REPORTES}/${unico.id}`, texto: 'Ver el reporte' },
    };
  }

  const adhesiones = enviados.filter((r) => r.esAdhesion).length;
  const partes = [`Se enviaron los ${enviados.length} reportes que guardaste sin conexión.`];
  if (adhesiones === 1) {
    partes.push('Uno se sumó como apoyo a un reporte que ya existía en el mismo lugar.');
  } else if (adhesiones > 1) {
    partes.push(`${adhesiones} se sumaron como apoyo a reportes que ya existían en el mismo lugar.`);
  }
  return {
    texto: partes.join(' '),
    enlace: { href: RUTA_MIS_REPORTES, texto: 'Ver en Mis reportes' },
  };
}
