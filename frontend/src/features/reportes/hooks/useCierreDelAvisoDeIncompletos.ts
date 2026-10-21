'use client';

import { useCallback, useState } from 'react';

/** Clave en `sessionStorage`: dura lo que la pestaña, no entre sesiones del navegador. */
export const CLAVE_AVISO_INCOMPLETOS_CERRADO = 'viasegura-aviso-incompletos-cerrado';

function leer(): number | null {
  try {
    const valor = sessionStorage.getItem(CLAVE_AVISO_INCOMPLETOS_CERRADO);
    const n = valor == null ? NaN : Number(valor);
    return Number.isFinite(n) ? n : null;
  } catch {
    // Sin `sessionStorage` (modo privado estricto): el cierre vale en memoria.
    return null;
  }
}

function guardar(cantidad: number): void {
  try {
    sessionStorage.setItem(CLAVE_AVISO_INCOMPLETOS_CERRADO, String(cantidad));
  } catch {
    // Igual queda cerrado en memoria mientras la pantalla siga montada.
  }
}

/**
 * NC-02: el aviso de reportes incompletos se puede cerrar por el resto de la
 * sesion de la pestaña (`sessionStorage`; si no esta disponible, en
 * memoria). Se guarda CUANTOS habia al cerrarlo: si despues aparecen mas, el
 * aviso vuelve, porque es informacion nueva. No es una preferencia del
 * ciudadano ni un dato del reporte; solo evita que tape la pantalla.
 */
export function useCierreDelAvisoDeIncompletos(cantidad: number) {
  const [cerradoCon, setCerradoCon] = useState<number | null>(leer);
  const visible = cantidad > 0 && (cerradoCon == null || cantidad > cerradoCon);
  const cerrar = useCallback(() => {
    setCerradoCon(cantidad);
    guardar(cantidad);
  }, [cantidad]);
  return { visible, cerrar };
}
