'use client';

import { useFotoDePerfil } from '../hooks/useFotoDePerfil';

/**
 * Muestra la foto de perfil, que NO se puede poner directo en un `<img src>`.
 *
 * El backend la sirve por un endpoint que exige `Authorization` y verifica
 * al dueno; el navegador no adjunta esa cabecera al resolver un `src`, asi
 * que un `<img>` directo recibiria 401. Se descarga con fetch, se convierte
 * a blob y se muestra desde una URL local: lo resuelve `useFotoDePerfil`.
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
  const { src, fallo } = useFotoDePerfil(fotoUrl);

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
