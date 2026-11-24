'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { BotonIcono, Icono } from '@/components/ui/Icono';
import { IconoDeCategoria } from '@/components/ui/IconoDeCategoria';
import type { CategoriaDano } from '@/lib/types/domain';

/**
 * US-24 Esc. 2: ayuda contextual del selector «Tipo de daño». El botón «?»
 * junto a la etiqueta despliega cada tipo de daño con su descripción (la que
 * ya trae el catálogo del API, también para las categorías propias del
 * distrito, US-29).
 *
 * Es un desplegable (botón con `aria-expanded` y el panel debajo), no un
 * tooltip que aparece al pasar el ratón: así se abre con el teclado y con el
 * dedo, no tapa el selector y no desaparece mientras se lee (WCAG 1.4.13).
 * Se cierra con el mismo botón, con su X o con Escape (el foco vuelve al «?»).
 *
 * Pendiente: el criterio pide imágenes de ejemplo de cada tipo de daño. No
 * hay fotos de ejemplo con licencia en el proyecto, ni un campo para ellas en
 * el catálogo; por ahora cada tipo se explica con su descripción.
 */
export function AyudaDeCategorias({ categorias }: { categorias: readonly CategoriaDano[] }) {
  const [abierta, setAbierta] = useState(false);
  const idPanel = useId();
  const idTitulo = useId();
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      setAbierta(false);
      boton.current?.focus();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta]);

  function cerrar() {
    setAbierta(false);
    boton.current?.focus();
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-expanded={abierta}
        aria-controls={idPanel}
        aria-label="Ayuda: qué tipo de daño elegir"
        title="Ayuda: qué tipo de daño elegir"
        onClick={() => setAbierta(!abierta)}
        className="inline-flex size-objetivo shrink-0 items-center justify-center rounded-control text-enlace hover:bg-superficie-2 hover:text-enlace-hover -my-2.5"
      >
        <Icono icono={CircleHelp} />
      </button>
      {/* `w-full`: en la fila flexible de la etiqueta, el panel baja a su propia línea. */}
      <div id={idPanel} hidden={!abierta} className="w-full">
        {abierta && (
          <section
            aria-labelledby={idTitulo}
            className="flex flex-col gap-2 rounded-control border border-info-borde bg-info-fondo p-3 text-sm text-info-texto"
          >
            <div className="flex items-start gap-2">
              <h3 id={idTitulo} className="flex-1 font-semibold">
                ¿Qué tipo de daño elijo?
              </h3>
              <BotonIcono icono={X} etiqueta="Cerrar la ayuda" onClick={cerrar} className="-my-2.5 -mr-2 text-info-texto" />
            </div>
            {categorias.length === 0 ? (
              <p>Los tipos de daño aparecen cuando cargue el catálogo.</p>
            ) : (
              <dl className="flex flex-col gap-1.5">
                {categorias.map((c) => (
                  <div key={c.id}>
                    <dt className="flex items-center gap-1.5 font-medium">
                      <IconoDeCategoria icono={c.icono} tamano={16} />
                      {c.nombre}
                    </dt>
                    <dd>{c.descripcion?.trim() || 'Sin descripción.'}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p>
              Si dudas, elige el más parecido y cuenta en el título qué ves.{' '}
              <Link href="/como-funciona" className="font-medium underline">
                Ver la guía
              </Link>
            </p>
          </section>
        )}
      </div>
    </>
  );
}
