'use client';

import {
  alternarOrden,
  anchoBarra,
  formatearSatisfaccion,
  formatearTasa,
  formatearTiempo,
  ordenar,
  SIN_DATOS,
  type ColumnaOrden,
  type DesempenoDistrital,
  type Orden,
} from '../model/formato';

/**
 * Ranking de desempeno distrital (US-18/US-20).
 *
 * Tabla con una barra de progreso por distrito, sin libreria de graficos: la
 * barra es un `div` con `width` en porcentaje. Para un ranking de una sola
 * magnitud comparable eso alcanza, y evita sumar una dependencia de charts
 * al proyecto solo para esto.
 *
 * La barra usa UN color, no una escala rojo-ambar-verde. Colorear por umbrales
 * obligaria a inventar que tasa cuenta como "mala", un juicio que ni el
 * backlog ni el backend definen; el ranking y el numero ya comunican la
 * comparacion sin que la interfaz emita una calificacion propia.
 */
interface Props {
  filas: DesempenoDistrital[];
  orden: Orden;
  onOrdenar: (orden: Orden) => void;
  /** US-19: distritos marcados para comparar. */
  comparados: number[];
  onAlternarComparacion: (distritoId: number) => void;
}

export function TablaDesempeno({ filas, orden, onOrdenar, comparados, onAlternarComparacion }: Props) {
  const ordenadas = ordenar(filas, orden);

  return (
    <div className="flex flex-col gap-1.5">
      {/* QA-1 M-12: en el movil la tabla (46rem) no cabe y obligaba a
          desplazarse en horizontal sin ninguna pista: tasa, tiempo y
          satisfaccion quedaban fuera de la vista. Es texto visible solo en
          pantallas angostas y NO la descripcion accesible de la region: con
          `aria-describedby` el lector lo anunciaba tambien en escritorio,
          donde la tabla cabe. En el movil se lee en su orden, antes de la tabla. */}
      <p className="text-xs text-slate-500 md:hidden dark:text-slate-400">
        Desliza la tabla hacia los lados para ver todas las columnas.{' '}
        <span aria-hidden="true">→</span>
      </p>
      {/* Region con foco: con el teclado tambien se puede desplazar. */}
      <div
        role="region"
        aria-label="Ranking de distritos"
        tabIndex={0}
        className="overflow-x-auto rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
      >
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">
            Ranking de distritos de Lima Metropolitana por tasa de resolución de reportes viales
          </caption>
          <thead>
            <tr className="border-b border-slate-300 text-left dark:border-slate-600">
              <th scope="col" className="w-10 px-2 py-2 font-medium text-slate-500">
                #
              </th>
              <th scope="col" className="w-20 px-2 py-2 text-left font-medium text-slate-700 dark:text-slate-200">
                Comparar
              </th>
              <Encabezado columna="distrito" orden={orden} onOrdenar={onOrdenar}>
                Distrito
              </Encabezado>
              <Encabezado columna="tasa" orden={orden} onOrdenar={onOrdenar}>
                Tasa de resolución
              </Encabezado>
              <Encabezado columna="reportes" orden={orden} onOrdenar={onOrdenar}>
                Reportes
              </Encabezado>
              <Encabezado columna="tiempo" orden={orden} onOrdenar={onOrdenar}>
                Tiempo promedio
              </Encabezado>
              <Encabezado columna="satisfaccion" orden={orden} onOrdenar={onOrdenar}>
                Satisfacción
              </Encabezado>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((fila, indice) => (
              <tr
                key={fila.distritoId}
                className="border-b border-slate-200 last:border-0 dark:border-slate-700"
              >
                <td className="px-2 py-2 text-slate-500 tabular-nums">{indice + 1}</td>
                <td className="px-2 py-2">
                  {/* No se deshabilita al llegar al maximo: al intentar marcar un quinto
                      distrito se explica por que no se agrega (US-19). */}
                  <input
                    type="checkbox"
                    checked={fila.distritoId != null && comparados.includes(fila.distritoId)}
                    onChange={() => {
                      if (fila.distritoId != null) onAlternarComparacion(fila.distritoId);
                    }}
                    aria-label={`Comparar ${fila.distritoNombre ?? ''}`}
                    className="size-4"
                  />
                </td>
                <th scope="row" className="px-2 py-2 text-left font-medium text-slate-900 dark:text-slate-100">
                  {fila.distritoNombre}
                </th>
                <td className="px-2 py-2">
                  <BarraTasa tasa={fila.tasaResolucion} />
                </td>
                <td className="px-2 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                  {fila.totalResueltos ?? 0} / {fila.totalReportes ?? 0}
                </td>
                <td className="px-2 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                  {formatearTiempo(fila.tiempoPromedioHoras)}
                </td>
                <td className="px-2 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                  {formatearSatisfaccion(fila.satisfaccionPromedio)}
                  {(fila.totalCalificaciones ?? 0) > 0 && (
                    <span className="ml-1 text-xs text-slate-500">
                      ({fila.totalCalificaciones})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarraTasa({ tasa }: { tasa: number | null | undefined }) {
  const ancho = anchoBarra(tasa);
  const etiqueta = formatearTasa(tasa);

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        // La barra es decorativa: el valor va en texto al lado, que es lo
        // que leen los lectores de pantalla.
        aria-hidden="true"
      >
        <div className="h-full rounded-full bg-sky-600" style={{ width: `${ancho}%` }} />
      </div>
      <span
        className={`tabular-nums ${
          etiqueta === SIN_DATOS
            ? 'text-slate-400 dark:text-slate-500'
            : 'text-slate-900 dark:text-slate-100'
        }`}
      >
        {etiqueta}
      </span>
    </div>
  );
}

function Encabezado({
  columna,
  orden,
  onOrdenar,
  children,
}: {
  columna: ColumnaOrden;
  orden: Orden;
  onOrdenar: (o: Orden) => void;
  children: React.ReactNode;
}) {
  const activa = orden.columna === columna;
  return (
    <th
      scope="col"
      className="px-2 py-2 font-medium"
      // Comunica el orden a lectores de pantalla, no solo con la flecha.
      aria-sort={activa ? (orden.descendente ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onOrdenar(alternarOrden(orden, columna))}
        className="flex items-center gap-1 text-slate-700 hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-400"
      >
        {children}
        <span aria-hidden="true" className="text-xs">
          {activa ? (orden.descendente ? '▼' : '▲') : '↕'}
        </span>
      </button>
    </th>
  );
}
