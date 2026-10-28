'use client';

import { Lightbulb, LoaderCircle } from 'lucide-react';
import { clasesDeBoton } from '@/components/ui/Boton';
import { clasesDeAviso } from '@/components/ui/Aviso';
import { Icono } from '@/components/ui/Icono';
import type { VistaDeSugerencia } from '../model/sugerencia';

/**
 * NC-04: lo que dice la foto sobre el tipo de daño, junto al selector.
 *
 * - **Solo propone.** El selector no cambia sin una acción del ciudadano: la
 *   sugerencia trae un botón «Elegir …», y el texto dice que es automática y
 *   que la decisión es suya (DS 016-2024-JUS, art. 6.1).
 * - **Se anuncia.** El texto va en una región `role="status"` que existe
 *   siempre (también vacía): una región que aparece junto con su texto no la
 *   anuncian todos los lectores de pantalla. El botón queda fuera de la región
 *   para que el anuncio sea solo el texto. El selector la referencia con
 *   `aria-describedby` (`id`), así que se vuelve a oír al llegar a él.
 * - Sin porcentajes ni «confianza»: el API no los da, a propósito.
 */
export function SugerenciaDeCategoria({
  id,
  vista,
  onElegir,
}: {
  /** `id` del texto, para el `aria-describedby` del selector. */
  id: string;
  vista: VistaDeSugerencia;
  /** El ciudadano acepta la sugerencia (el único camino para elegirla). */
  onElegir: (categoriaId: number) => void;
}) {
  const sugerida = vista.tipo === 'sugerida' ? vista : null;
  const conCaja = sugerida !== null;
  return (
    <div
      className={
        conCaja
          ? `flex flex-col items-start gap-2 ${clasesDeAviso('info')}`
          : 'flex flex-col items-start'
      }
    >
      <p
        id={id}
        role="status"
        className={`flex items-start gap-2 text-sm ${conCaja ? '' : 'text-texto-2'}`}
      >
        {vista.tipo === 'analizando' && (
          <>
            <Icono icono={LoaderCircle} tamano={18} className="mt-px motion-safe:animate-spin" />
            <span>Analizando la foto para sugerirte un tipo de daño…</span>
          </>
        )}
        {vista.tipo === 'sin-sugerencia' && (
          <span>No hay una sugerencia para esta foto. Elige el tipo de daño en la lista.</span>
        )}
        {sugerida && (
          <>
            <Icono icono={Lightbulb} tamano={18} className="mt-px" />
            <span>
              {sugerida.yaElegida ? (
                <>
                  Sugerencia por la foto: <strong>{sugerida.nombre}</strong>, el tipo que
                  elegiste. Es automática: si no es correcto, cámbialo.
                </>
              ) : (
                <>
                  Sugerencia por la foto: <strong>{sugerida.nombre}</strong>. Es automática: el
                  tipo de daño lo eliges tú.
                </>
              )}
            </span>
          </>
        )}
      </p>
      {sugerida && sugerida.seleccionable && !sugerida.yaElegida && (
        <button
          type="button"
          onClick={() => onElegir(sugerida.categoriaId)}
          className={clasesDeBoton('secundario', 'compacto')}
        >
          Elegir «{sugerida.nombre}»
        </button>
      )}
    </div>
  );
}
