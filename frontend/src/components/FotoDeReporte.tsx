'use client';

import { useState } from 'react';
import { FOTO_NO_DISPONIBLE, nombreDelReemplazo } from '@/lib/types/fotoDeReporte';

interface Props {
  /** URL absoluta (la compone `api.ts`). La foto de un reporte es publica: va directo en `<img src>`. */
  src: string;
  /** Texto alternativo. Vacio = decorativa (p. ej. la miniatura de una fila que ya nombra el reporte). */
  alt: string;
  className?: string;
  /** Clases extra solo para el reemplazo (p. ej. un alto: un `div` sin imagen no lo tiene). */
  claseDelReemplazo?: string;
}

/**
 * QA-1 M-3: foto de un reporte con reemplazo si no carga.
 *
 * Sin esto, una foto que el backend ya no tiene (404) o que exige sesion (la
 * URL antigua `/media/fotos/<uuid>`, 401) se veia como el icono de imagen
 * rota del navegador. Ahora, ante el `error` del `<img>`, se dibuja un
 * recuadro neutro «Foto no disponible» del mismo tamaño.
 *
 * El texto alternativo no se pierde: el reemplazo es una imagen (`role="img"`)
 * cuyo nombre es el mismo `alt` mas el aviso, asi que un lector de pantalla
 * sigue sabiendo de que era la foto y, ademas, que no se pudo mostrar. Si la
 * foto era decorativa (`alt` vacio), el reemplazo tambien lo es.
 *
 * El error se recuerda por URL: si cambia `src` se vuelve a intentar.
 *
 * El popup del mapa hace lo mismo con su propio `<img>` (`map/` no importa
 * componentes compartidos); los dos toman el texto y el nombre del reemplazo
 * de `lib/types/fotoDeReporte.ts`.
 */
export function FotoDeReporte({ src, alt, className = '', claseDelReemplazo = '' }: Props) {
  const [fallida, setFallida] = useState<string | null>(null);

  if (fallida === src) {
    const nombre = nombreDelReemplazo(alt);
    return (
      <div
        role={nombre ? 'img' : undefined}
        aria-label={nombre ?? undefined}
        aria-hidden={nombre ? undefined : true}
        className={`flex items-center justify-center bg-slate-100 p-2 text-center text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300 ${className} ${claseDelReemplazo}`}
      >
        <span aria-hidden="true">{FOTO_NO_DISPONIBLE}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={() => setFallida(src)} />
  );
}
