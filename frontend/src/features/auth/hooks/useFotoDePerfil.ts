'use client';

import { useEffect, useState } from 'react';
import { descargarFotoDePerfil } from '../api';

export interface FotoDePerfilCargada {
  /** URL `blob:` lista para `<img src>`, o `null` si no hay foto (o aun no llega). */
  src: string | null;
  /** `true` si habia foto pero no se pudo traer. */
  fallo: boolean;
}

/**
 * US-30: la foto de perfil como URL `blob:` (ver `descargarFotoDePerfil`:
 * exige token, asi que no sirve directo en `<img src>`).
 *
 * La URL de objeto se libera al cambiar de foto o al desmontar; sin eso el
 * navegador retiene el blob toda la sesion.
 */
export function useFotoDePerfil(fotoUrl: string | null | undefined): FotoDePerfilCargada {
  const [src, setSrc] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let creada: string | null = null;

    // Todo dentro de la funcion asincrona: el estado nunca se escribe de
    // forma sincrona durante el efecto.
    const cargar = async () => {
      if (!fotoUrl) {
        if (!cancelado) setSrc(null);
        return;
      }
      setFallo(false);
      try {
        const url = await descargarFotoDePerfil(fotoUrl);
        if (cancelado) {
          // Llego tarde: se libera aqui o queda huerfana.
          URL.revokeObjectURL(url);
          return;
        }
        creada = url;
        setSrc(url);
      } catch {
        if (!cancelado) setFallo(true);
      }
    };
    void cargar();

    return () => {
      cancelado = true;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [fotoUrl]);

  return { src, fallo };
}
