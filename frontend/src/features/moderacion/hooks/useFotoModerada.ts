'use client';

import { useEffect, useState } from 'react';
import { descargarFotoModerada } from '../api';

export interface FotoModeradaCargada {
  /** URL `blob:` lista para `<img src>`, o `null` si no hay foto o aun no llega. */
  src: string | null;
  /** `true` si habia foto pero no se pudo traer. */
  fallo: boolean;
  cargando: boolean;
}

/**
 * NC-11b: la foto de un reporte en moderacion como URL `blob:`, aunque este
 * oculta (ver `descargarFotoModerada`: exige token, asi que no sirve en
 * `<img src>`). Mismo patron que `useFotoDePerfil` (US-30): la URL de objeto
 * se libera al cambiar de reporte o al desmontar.
 *
 * `version` fuerza a volver a pedirla (p. ej. tras restablecerla); con
 * `tieneFoto: false` no se pide nada.
 */
export function useFotoModerada(reporteId: number, tieneFoto: boolean, version = 0): FotoModeradaCargada {
  const [src, setSrc] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let creada: string | null = null;

    const cargar = async () => {
      if (!tieneFoto) {
        if (!cancelado) setSrc(null);
        return;
      }
      setFallo(false);
      setCargando(true);
      try {
        const url = await descargarFotoModerada(reporteId);
        if (cancelado) {
          URL.revokeObjectURL(url);
          return;
        }
        creada = url;
        setSrc(url);
      } catch {
        if (!cancelado) setFallo(true);
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    void cargar();

    return () => {
      cancelado = true;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [reporteId, tieneFoto, version]);

  return { src, fallo, cargando };
}
