'use client';

import type { Severidad } from '@/lib/types/domain';
import { OPCIONES_DE_SEVERIDAD } from '@/lib/types/tituloYSeveridad';
import { largoDelTitulo, TITULO_MAXIMO, TITULO_MINIMO } from '../model/titulo';

/**
 * NC-02: campos de titulo y severidad, compartidos por el formulario de
 * creacion (US-05), la edicion en PENDIENTE (US-08) y el completado de un
 * reporte de la cola offline (US-06).
 */

const CLASES_INPUT =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 ' +
  'focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 ' +
  'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

/**
 * Titulo con su contador. Sin `maxLength`: el navegador cuenta unidades
 * UTF-16 y el backend code points (un emoji es 1 para el backend y 2 para
 * `maxLength`); el limite lo valida `errorDelTitulo` antes de enviar.
 *
 * `error`: mensaje del campo (o `null`). Con error, el input queda
 * `aria-invalid` y describe el mensaje (`aria-describedby`), como `Campo` de
 * `components/ui/form`. El contador se marca fuera de rango: con mas de
 * {@link TITULO_MAXIMO}, y con menos de {@link TITULO_MINIMO} si ya se
 * escribio algo o hay error (un campo vacio recien abierto no se marca).
 */
export function CampoTitulo({
  id,
  valor,
  onCambiar,
  error = null,
  placeholder = 'Ej.: Bache profundo en el carril derecho',
}: {
  id: string;
  valor: string;
  onCambiar: (titulo: string) => void;
  error?: string | null;
  placeholder?: string;
}) {
  const largo = largoDelTitulo(valor);
  const fueraDeRango =
    largo > TITULO_MAXIMO || (largo < TITULO_MINIMO && (largo > 0 || error != null));
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Título
      </label>
      <input
        id={id}
        type="text"
        required
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
        className={`${CLASES_INPUT} aria-[invalid=true]:border-red-500`}
      />
      <p
        id={idAyuda}
        data-fuera-de-rango={fueraDeRango ? 'true' : undefined}
        className={`text-xs ${fueraDeRango ? 'text-red-700 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'}`}
      >
        De {TITULO_MINIMO} a {TITULO_MAXIMO} caracteres ({largo}/{TITULO_MAXIMO}).
      </p>
      {error && (
        <p id={idError} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Severidad: tres opciones y NINGUNA marcada al empezar (no hay valor por
 * defecto en el API; `MEDIA` solo se uso para rellenar los reportes
 * existentes). Radios y no `<select>`: son tres valores ordenados y se ven
 * todos de una vez.
 */
export function CampoSeveridad({
  nombre,
  valor,
  onCambiar,
  error = null,
}: {
  /** `name` del grupo de radios; debe ser unico en la pantalla. */
  nombre: string;
  valor: Severidad | null;
  onCambiar: (severidad: Severidad) => void;
  /** Mensaje del campo (o `null`): marca el grupo `aria-invalid` y lo describe. */
  error?: string | null;
}) {
  const idAyuda = `${nombre}-ayuda`;
  const idError = `${nombre}-error`;
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
    >
      <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Severidad
      </legend>
      <p id={idAyuda} className="text-xs text-slate-500 dark:text-slate-400">
        ¿Qué tan grave es el daño?
      </p>
      <div className="flex flex-wrap gap-2">
        {OPCIONES_DE_SEVERIDAD.map((opcion) => (
          <label
            key={opcion.valor}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5
                       text-sm text-slate-800 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50
                       dark:border-slate-600 dark:text-slate-100 dark:has-[:checked]:bg-sky-950"
          >
            <input
              type="radio"
              name={nombre}
              value={opcion.valor}
              checked={valor === opcion.valor}
              onChange={() => onCambiar(opcion.valor)}
            />
            {opcion.etiqueta}
          </label>
        ))}
      </div>
      {error && (
        <p id={idError} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  );
}
