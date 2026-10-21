'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Prefijo de la clave en `sessionStorage`: dura lo que la pestaña, no entre
 * sesiones del navegador. Va por usuario: en un dispositivo compartido, que A
 * cierre el aviso no debe ocultarselo a B en la misma pestaña.
 */
export const CLAVE_AVISO_INCOMPLETOS_CERRADO = 'viasegura-aviso-incompletos-cerrado';

export function claveDelCierre(usuarioId: number): string {
  return `${CLAVE_AVISO_INCOMPLETOS_CERRADO}:${usuarioId}`;
}

function leer(clave: string): number | null {
  try {
    const valor = sessionStorage.getItem(clave);
    const n = valor == null ? NaN : Number(valor);
    return Number.isFinite(n) ? n : null;
  } catch {
    // Sin `sessionStorage` (modo privado estricto): el cierre vale en memoria.
    return null;
  }
}

function guardar(clave: string, cantidad: number): void {
  try {
    sessionStorage.setItem(clave, String(cantidad));
  } catch {
    // Igual queda cerrado en memoria mientras la pantalla siga montada.
  }
}

/**
 * NC-02: el aviso de reportes incompletos se puede cerrar por el resto de la
 * sesion de la pestaña (`sessionStorage`; si no esta disponible, en
 * memoria). Se guarda CUANTOS habia al cerrarlo: si despues aparecen mas, el
 * aviso vuelve, porque es informacion nueva. Si bajan (el ciudadano completo
 * alguno), el umbral baja con ellos, para que uno nuevo vuelva a avisar. No es
 * una preferencia del ciudadano ni un dato del reporte; solo evita que tape la
 * pantalla.
 */
export function useCierreDelAvisoDeIncompletos(cantidad: number, usuarioId: number) {
  const clave = claveDelCierre(usuarioId);
  const [cierre, setCierre] = useState(() => ({ clave, con: leer(clave) }));

  // Cambio de usuario en la misma pestaña: se lee su propio cierre.
  let cerradoCon = cierre.con;
  if (cierre.clave !== clave) {
    cerradoCon = leer(clave);
    setCierre({ clave, con: cerradoCon });
  } else if (cerradoCon != null && cantidad < cerradoCon) {
    // Bajaron los incompletos: el umbral baja con ellos.
    cerradoCon = cantidad;
    setCierre({ clave, con: cantidad });
  }

  useEffect(() => {
    if (cierre.con != null) guardar(cierre.clave, cierre.con);
  }, [cierre]);

  const visible = cantidad > 0 && (cerradoCon == null || cantidad > cerradoCon);
  const cerrar = useCallback(() => setCierre({ clave, con: cantidad }), [clave, cantidad]);
  return { visible, cerrar };
}
