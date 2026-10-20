'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  AVISO_MAXIMO,
  agregarDistrito,
  depurarComparacion,
  leerComparacion,
  queryDeComparacion,
  quitarDistrito,
  type EstadoComparacion,
} from '../model/comparacion';

/**
 * US-19/US-20: distritos a comparar y tipo de dano, guardados en la URL
 * (`?comparar=21,41&categoria=3`) para que la comparacion se pueda compartir.
 *
 * Usa `router.replace`, no `push`: elegir distritos no deberia llenar el
 * historial de entradas que el boton Atras recorre una por una. `useSearchParams`
 * exige un limite de `Suspense` por encima (lo pone la pagina).
 *
 * Cada accion calcula sobre el estado que hoy muestra la URL: dos clics mas
 * rapidos que la actualizacion de la URL parten del mismo estado y gana el
 * segundo. Con `replace` la ventana es de milisegundos; se acepta.
 *
 * `distritosConocidos` y `categoriasConocidas` (`null` mientras no cargan)
 * depuran lo que una URL editada a mano trae y el catalogo no conoce.
 */
export function useComparacionEnUrl(
  distritosConocidos: ReadonlyMap<number, string> | null,
  categoriasConocidas: readonly number[] | null,
) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const estado = useMemo(
    () => depurarComparacion(leerComparacion(params), distritosConocidos, categoriasConocidas),
    [params, distritosConocidos, categoriasConocidas],
  );
  const [aviso, setAviso] = useState<string | null>(null);

  const escribir = useCallback(
    (nuevo: EstadoComparacion) => {
      const query = queryDeComparacion(nuevo);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  /** Marca o desmarca un distrito. Con el maximo elegido no agrega y avisa. */
  const alternarDistrito = useCallback(
    (id: number) => {
      if (estado.distritos.includes(id)) {
        setAviso(null);
        escribir({ ...estado, distritos: quitarDistrito(estado.distritos, id) });
        return;
      }
      const resultado = agregarDistrito(estado.distritos, id);
      if (!resultado.agregado) {
        setAviso(AVISO_MAXIMO);
        return;
      }
      setAviso(null);
      escribir({ ...estado, distritos: resultado.distritos });
    },
    [estado, escribir],
  );

  const quitar = useCallback(
    (id: number) => {
      setAviso(null);
      escribir({ ...estado, distritos: quitarDistrito(estado.distritos, id) });
    },
    [estado, escribir],
  );

  const limpiar = useCallback(() => {
    setAviso(null);
    escribir({ ...estado, distritos: [] });
  }, [estado, escribir]);

  const cambiarCategoria = useCallback(
    (categoriaId: number | null) => {
      setAviso(null);
      escribir({ ...estado, categoriaId });
    },
    [estado, escribir],
  );

  return { ...estado, aviso, alternarDistrito, quitar, limpiar, cambiarCategoria };
}
