'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { clasesDeBoton, EnlaceBoton } from '@/components/ui/Boton';
import { Icono } from '@/components/ui/Icono';
import { CLASES_TARJETA } from '@/components/ui/Tarjeta';
import { acotarPaso, esPrimerPaso, esUltimoPaso, PASOS, textoDeProgreso } from '../model/pasos';
import { IlustracionDePaso } from './IlustracionDePaso';

/**
 * US-24 Esc. 1: guía interactiva «¿Cómo funciona?».
 *
 * Accesibilidad (WCAG 2.2 AA):
 * - Todo es un botón o un enlace nativo: se recorre con Tab y se activa con
 *   Enter o Espacio, sin atajos propios que aprender.
 * - La lista de pasos marca el actual con `aria-current="step"` y deja saltar
 *   a cualquiera; no hay que pasar por todos.
 * - Al cambiar de paso, el foco va al título del paso nuevo (que se lee con
 *   su «Paso N de M»): quien usa lector de pantalla no queda en un botón cuyo
 *   contexto cambió. Al cargar no se mueve el foco.
 * - Se puede omitir en cualquier momento («Saltar la guía»), y ningún paso
 *   avanza solo (sin límites de tiempo, 2.2.1).
 */
export function GuiaInteractiva() {
  const [indice, setIndice] = useState(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const enfocarAlCambiar = useRef(false);
  const paso = PASOS[acotarPaso(indice)]!;
  const idTitulo = `paso-${paso.id}-titulo`;

  useEffect(() => {
    if (!enfocarAlCambiar.current) return;
    enfocarAlCambiar.current = false;
    titulo.current?.focus();
  }, [indice]);

  function irA(nuevo: number) {
    enfocarAlCambiar.current = true;
    setIndice(acotarPaso(nuevo));
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-texto">¿Cómo funciona Ciudad Viva?</h1>
        <p className="text-texto-2">
          En {PASOS.length} pasos cortos: cómo reportar un daño vial y seguirlo hasta que se
          resuelva.
        </p>
        <Link href="/mapa" className="self-start font-medium text-enlace underline underline-offset-4 hover:text-enlace-hover">
          Saltar la guía e ir al mapa
        </Link>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <nav aria-label="Pasos de la guía" className="md:w-60 md:shrink-0">
          <ol className="flex flex-col gap-1">
            {PASOS.map((p, i) => {
              const actual = i === indice;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => irA(i)}
                    aria-current={actual ? 'step' : undefined}
                    className={[
                      'flex min-h-objetivo w-full items-center gap-3 rounded-control px-3 text-left text-sm',
                      actual
                        ? 'bg-primario font-semibold text-sobre-primario'
                        : 'text-texto hover:bg-superficie-2',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                        actual ? 'border-sobre-primario' : 'border-linea-campo',
                      ].join(' ')}
                    >
                      {i < indice ? <Icono icono={Check} tamano={14} /> : i + 1}
                    </span>
                    <span>{p.titulo}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-labelledby={idTitulo} className={`${CLASES_TARJETA} flex flex-1 flex-col gap-5 p-4 sm:p-6`}>
          <div className="flex flex-col-reverse gap-5 sm:flex-row sm:items-start">
            <div className="flex flex-1 flex-col gap-3">
              <h2 id={idTitulo} ref={titulo} tabIndex={-1} className="flex flex-col gap-1">
                <span className="text-sm font-medium text-texto-2">{textoDeProgreso(indice)}</span>
                <span className="text-xl font-bold text-texto">{paso.titulo}</span>
              </h2>
              <p className="text-texto">{paso.resumen}</p>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-texto">
                {paso.puntos.map((punto) => (
                  <li key={punto}>{punto}</li>
                ))}
              </ul>
              <EnlaceBoton href={paso.enlace.href} variante="texto" className="self-start px-0">
                {paso.enlace.texto}
              </EnlaceBoton>
            </div>
            <div className="flex justify-center sm:w-56 sm:shrink-0">
              <IlustracionDePaso tipo={paso.ilustracion} descripcion={paso.descripcionIlustracion} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-4">
            {esPrimerPaso(indice) ? (
              <span />
            ) : (
              <button type="button" onClick={() => irA(indice - 1)} className={clasesDeBoton('secundario')}>
                <Icono icono={ArrowLeft} />
                Anterior
              </button>
            )}
            {esUltimoPaso(indice) ? (
              <EnlaceBoton href="/mapa">
                Empezar
                <Icono icono={ArrowRight} />
              </EnlaceBoton>
            ) : (
              <button type="button" onClick={() => irA(indice + 1)} className={clasesDeBoton('primario')}>
                Siguiente
                <Icono icono={ArrowRight} />
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
