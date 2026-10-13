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
}

export function TablaDesempeno({ filas, orden, onOrdenar }: Props) {
  const ordenadas = ordenar(filas, orden);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <caption className="sr-only">
          Ranking de distritos de Lima Metropolitana por tasa de resolución de reportes viales
        </caption>
        <thead>
          <tr className="border-b border-slate-300 text-left dark:border-slate-600">
            <th scope="col" className="w-10 px-2 py-2 font-medium text-slate-500">
              #
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
