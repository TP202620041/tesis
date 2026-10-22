import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * Primitivas de formulario compartidas.
 *
 * Accesibilidad desde el inicio, no como retoque posterior: cada campo tiene
 * un `<label>` real asociado por `htmlFor`, los errores se anuncian con
 * `role="alert"` y se enlazan al input con `aria-describedby`. US-23
 * (accesibilidad) construye sobre esto en vez de tener que reescribirlo.
 */

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
      <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcion || undefined}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900
                   outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30
                   dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100
                   aria-[invalid=true]:border-red-500"
        {...props}
      />
      {ayuda && (
        <p id={idAyuda} className="text-xs text-slate-500 dark:text-slate-400">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function Boton({
  children,
  cargando = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; cargando?: boolean }) {
  return (
    <button
      type="submit"
      disabled={cargando || props.disabled}
      className="rounded-md bg-sky-600 px-4 py-2 font-medium text-white transition
                 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500/50
                 disabled:cursor-not-allowed disabled:opacity-60"
      {...props}
    >
      {cargando ? 'Procesando…' : children}
    </button>
  );
}

/** Error de la operacion completa (no de un campo). */
export function AlertaError({ mensaje, detalles = [] }: { mensaje: string; detalles?: string[] }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800
                 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      <p>{mensaje}</p>
      {detalles.length > 0 && (
        <ul className="mt-1 list-inside list-disc">
          {detalles.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
