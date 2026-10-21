'use client';

import type { DistritoComparado } from '../model/comparacion';
import { MIN_COMPARAR } from '../model/comparacion';
import { formatearTasa, formatearTiempo, SIN_DATOS } from '../model/formato';
import { GraficaTasas } from './GraficaTasas';

interface Props {
  distritos: DistritoComparado[];
  /** Nombre del tipo de dano filtrado, o `null` con todos los tipos. */
  categoriaNombre: string | null;
  onQuitar: (distritoId: number) => void;
  onLimpiar: () => void;
}

/**
 * US-19: comparacion lado a lado de 2 a 4 distritos.
 *
 * La tabla (una columna por distrito) es la comparacion y, a la vez, el
 * equivalente en texto de la grafica para lectores de pantalla.
 */
export function ComparacionDistritos({ distritos, categoriaNombre, onQuitar, onLimpiar }: Props) {
  if (distritos.length === 0) return null;

  const titulo = `Comparación de distritos${categoriaNombre ? ` · ${categoriaNombre}` : ''}`;

  return (
    <section
      aria-labelledby="titulo-comparacion"
      className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-comparacion" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {titulo}
        </h2>
        <button
          type="button"
          onClick={onLimpiar}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100
                     dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Limpiar comparación
        </button>
      </header>

      {distritos.length < MIN_COMPARAR ? (
        <div className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-300">
          <p>Elige al menos un distrito más en la tabla para comparar.</p>
          <ul className="flex flex-wrap gap-2">
            {distritos.map((d) => (
              <li key={d.distritoId}>
                <BotonQuitar distrito={d} onQuitar={onQuitar} conNombre />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                {titulo}: tasa de resolución, reportes resueltos sobre el total y tiempo promedio
                de atención de cada distrito.
              </caption>
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-600">
                  <td className="px-2 py-2" />
                  {distritos.map((d) => (
                    <th key={d.distritoId} scope="col" className="px-2 py-2 text-left align-top">
                      <span className="block font-semibold text-slate-900 dark:text-slate-100">
                        {d.nombre}
                      </span>
                      <BotonQuitar distrito={d} onQuitar={onQuitar} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Fila titulo="Tasa de resolución" distritos={distritos}>
                  {(d) => formatearTasa(d.fila?.tasaResolucion)}
                </Fila>
                <Fila titulo="Resueltos / total" distritos={distritos}>
                  {/* Sin fila no se sabe el total: «Sin datos», no un 0 / 0 afirmado. */}
                  {(d) =>
                    d.fila ? `${d.fila.totalResueltos ?? 0} / ${d.fila.totalReportes ?? 0}` : SIN_DATOS
                  }
                </Fila>
                <Fila titulo="Tiempo promedio de atención" distritos={distritos}>
                  {(d) => formatearTiempo(d.fila?.tiempoPromedioHoras)}
                </Fila>
              </tbody>
            </table>
          </div>

          <GraficaTasas distritos={distritos} />

          {categoriaNombre != null && distritos.some((d) => d.fila == null) && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              «{SIN_DATOS}»: ese distrito no tiene reportes de este tipo de daño. No es un 0 %:
              no participa de la métrica.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Fila({
  titulo,
  distritos,
  children,
}: {
  titulo: string;
  distritos: DistritoComparado[];
  children: (d: DistritoComparado) => string;
}) {
  return (
    <tr className="border-b border-slate-200 last:border-0 dark:border-slate-700">
      <th scope="row" className="px-2 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
        {titulo}
      </th>
      {distritos.map((d) => {
        const valor = children(d);
        return (
          <td
            key={d.distritoId}
            className={`px-2 py-2 tabular-nums ${
              valor === SIN_DATOS
                ? 'text-slate-400 dark:text-slate-500'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {valor}
          </td>
        );
      })}
    </tr>
  );
}

function BotonQuitar({
  distrito,
  onQuitar,
  conNombre = false,
}: {
  distrito: DistritoComparado;
  onQuitar: (id: number) => void;
  conNombre?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onQuitar(distrito.distritoId)}
      aria-label={`Quitar ${distrito.nombre} de la comparación`}
      className="text-xs font-normal text-sky-700 hover:underline dark:text-sky-400"
    >
      {conNombre ? `${distrito.nombre} ✕` : 'Quitar'}
    </button>
  );
}
