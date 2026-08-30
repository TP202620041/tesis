'use client';

import { useEffect, useState } from 'react';
import { descargarFotoDePerfil } from '@/features/auth/fotoPerfil';

/**
 * Muestra la foto de perfil, que NO se puede poner directo en un `<img src>`.
 *
 * El backend la sirve por un endpoint que exige `Authorization` y verifica
 * al dueno; el navegador no adjunta esa cabecera al resolver un `src`, asi
 * que un `<img>` directo recibiria 401. Se descarga con fetch, se convierte
 * a blob y se muestra desde una URL local — ver `fotoPerfil.ts`.
 *
 * La URL de objeto se libera al cambiar de foto o al desmontar; sin eso el
 * navegador retiene el blob toda la sesion.
 */
export function FotoDePerfil({
  fotoUrl,
  nombre,
  tamano = '6rem',
}: {
  fotoUrl: string | null | undefined;
  nombre: string;
  tamano?: string;
}) {
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

  const estilo = { width: tamano, height: tamano };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`Foto de perfil de ${nombre}`}
        style={estilo}
        className="shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700"
      />
    );
  }

  // Sin foto (o si no se pudo traer): inicial del nombre, no un hueco roto.
  return (
    <span
      aria-hidden={fallo ? undefined : 'true'}
      title={fallo ? 'No se pudo cargar tu foto' : undefined}
      style={estilo}
      className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-2xl
                 font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300"
    >
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}
