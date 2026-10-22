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
  'min-h-objetivo rounded-control border border-linea-campo bg-superficie px-3 py-2 text-texto ' +
  'aria-[invalid=true]:border-2 aria-[invalid=true]:border-error';

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
      <label htmlFor={id} className="text-sm font-medium text-texto">
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
        className={`${CLASES_INPUT} aria-[invalid=true]:border-error`}
      />
      <p
        id={idAyuda}
        data-fuera-de-rango={fueraDeRango ? 'true' : undefined}
        className={`text-xs ${fueraDeRango ? 'text-error' : 'text-texto-2'}`}
      >
        De {TITULO_MINIMO} a {TITULO_MAXIMO} caracteres ({largo}/{TITULO_MAXIMO}).
      </p>
      {error && (
        <p id={idError} role="alert" className="text-sm text-error">
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
  const idLeyenda = `${nombre}-leyenda`;
  // `radiogroup` y no el `group` implicito del fieldset: `aria-invalid` no
  // esta admitido en `group`. El nombre sigue siendo la leyenda.
  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={idLeyenda}
      className="flex flex-col gap-1.5"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
    >
      <legend id={idLeyenda} className="text-sm font-medium text-texto">
        Severidad
      </legend>
      <p id={idAyuda} className="text-xs text-texto-2">
        ¿Qué tan grave es el daño?
      </p>
      <div className="flex flex-wrap gap-2">
        {OPCIONES_DE_SEVERIDAD.map((opcion) => (
          <label
            key={opcion.valor}
            className="flex min-h-objetivo cursor-pointer items-center gap-2 rounded-control border border-linea-campo px-3 py-1.5
                       text-sm text-texto has-[:checked]:border-2 has-[:checked]:border-primario has-[:checked]:bg-superficie-2
                       has-[:checked]:font-semibold"
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
        <p id={idError} role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
