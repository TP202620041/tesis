import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Aviso } from './Aviso';
import { clasesDeBoton, type TamanoBoton, type VarianteBoton } from './Boton';

/**
 * Primitivas de formulario compartidas.
 *
 * Accesibilidad desde el inicio, no como retoque posterior: cada campo tiene
 * un `<label>` real asociado por `htmlFor`, los errores se anuncian con
 * `role="alert"` y se enlazan al input con `aria-describedby`. US-23
 * (accesibilidad) construye sobre esto en vez de tener que reescribirlo.
 *
 * Estilo «Cívica» (DIS-1): borde de control de 3:1 (`linea-campo`), 44 px de
 * alto, y el foco amarillo de la regla global. Un campo con error pasa a
 * borde de 2 px en el color de error, además del mensaje.
 */

/**
 * Clases de un control de formulario (`<input>`, `<select>`, `<textarea>`)
 * para los que no pasan por {@link Campo}.
 */
export const CLASE_CONTROL =
  'min-h-objetivo w-full rounded-control border border-linea-campo bg-superficie px-3 py-2 text-base text-texto ' +
  'placeholder:text-texto-2 disabled:cursor-not-allowed disabled:bg-superficie-2 ' +
  'aria-[invalid=true]:border-2 aria-[invalid=true]:border-error';

/** Clases de la etiqueta de un control. */
export const CLASE_ETIQUETA = 'text-sm font-semibold text-texto';

interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  etiqueta: string;
  error?: string;
  /** Indicacion que se ve ANTES de equivocarse (p. ej. el minimo de una contraseña). */
  ayuda?: string;
}

export function Campo({ id, etiqueta, error, ayuda, ...props }: CampoProps) {
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const descripcion = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={CLASE_ETIQUETA}>
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcion || undefined}
        className={CLASE_CONTROL}
        {...props}
      />
      {ayuda && (
        <p id={idAyuda} className="text-sm text-texto-2">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} role="alert" className="text-sm font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Botón de envío de un formulario (`type="submit"` salvo que se diga otro),
 * con estado de carga. Por defecto es el primario; `variante` lo cambia.
 */
export function Boton({
  children,
  cargando = false,
  variante = 'primario',
  tamano = 'normal',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  cargando?: boolean;
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
}) {
  return (
    <button
      type="submit"
      disabled={cargando || props.disabled}
      className={clasesDeBoton(variante, tamano)}
      {...props}
    >
      {cargando ? 'Procesando…' : children}
    </button>
  );
}

/** Error de la operacion completa (no de un campo). */
export function AlertaError({ mensaje, detalles = [] }: { mensaje: string; detalles?: string[] }) {
  return (
    <Aviso tono="error" rol="alert">
      <p>{mensaje}</p>
      {detalles.length > 0 && (
        <ul className="list-inside list-disc">
          {detalles.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </Aviso>
  );
}
