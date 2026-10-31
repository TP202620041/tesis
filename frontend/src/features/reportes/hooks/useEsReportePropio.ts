'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import { misReportes } from '../api';

/**
 * NC-11b: si el reporte publico que mira el CIUDADANO es suyo. Decide si se
 * ofrece «Denunciar contenido»: el backend rechaza con 409 `DENUNCIA_PROPIA`
 * denunciar el propio reporte, y no tiene sentido ofrecer un boton que va a
 * fallar.
 *
 * El resumen publico no dice quien lo creo (es el mismo DTO que ve el mapa
 * anonimo), asi que se busca entre «mis reportes», como hace `useMiReporte`.
 * Con `habilitado: false` (sin sesion u otro rol) no se consulta nada.
 *
 * Devuelve `null` mientras no se sabe; si la consulta falla, `false`: se
 * ofrece el boton y, si era propio, el 409 lo dira.
 */
export function useEsReportePropio(reporteId: number, habilitado: boolean): boolean | null {
  const carga = useCarga<boolean | null>(
    () =>
      habilitado
        ? misReportes()
            .then((lista) => lista.some((r) => r.id === reporteId))
            .catch(() => false)
        : Promise.resolve(false),
    [reporteId, habilitado],
  );
  return carga.estado === 'listo' ? carga.datos : null;
}
