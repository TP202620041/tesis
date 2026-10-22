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
      <p className="text-xs text-texto-2 md:hidden">
        Desliza la tabla hacia los lados para ver todas las columnas.{' '}
        <span aria-hidden="true">→</span>
      </p>
      {/* Region con foco: con el teclado tambien se puede desplazar. */}
      <div
        role="region"
        aria-label="Ranking de distritos"
        tabIndex={0}
        className="overflow-x-auto rounded-control"
      >
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">
            Ranking de distritos de Lima Metropolitana por tasa de resolución de reportes viales
          </caption>
          <thead>
            <tr className="border-b border-linea-campo text-left">
              <th scope="col" className="w-10 px-2 py-2 font-medium text-texto-2">
                #
              </th>
              <th scope="col" className="w-20 px-2 py-2 text-left font-medium text-texto">
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
                className="border-b border-linea last:border-0"
              >
                <td className="px-2 py-2 text-texto-2 tabular-nums">{indice + 1}</td>
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
                <th scope="row" className="px-2 py-2 text-left font-medium text-texto">
                  {fila.distritoNombre}
                </th>
                <td className="px-2 py-2">
                  <BarraTasa tasa={fila.tasaResolucion} />
                </td>
                <td className="px-2 py-2 tabular-nums text-texto">
                  {fila.totalResueltos ?? 0} / {fila.totalReportes ?? 0}
                </td>
                <td className="px-2 py-2 tabular-nums text-texto">
                  {formatearTiempo(fila.tiempoPromedioHoras)}
                </td>
                <td className="px-2 py-2 tabular-nums text-texto">
                  {formatearSatisfaccion(fila.satisfaccionPromedio)}
                  {(fila.totalCalificaciones ?? 0) > 0 && (
                    <span className="ml-1 text-xs text-texto-2">
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
        // DIS-1: «Sin datos» lleva la pista punteada, para no parecer «0 %»
        // (pista llena y vacía): null no es cero.
        className={`h-2 w-24 shrink-0 overflow-hidden rounded-full ${
          etiqueta === SIN_DATOS ? 'border border-dashed border-linea-campo' : 'bg-pista'
        }`}
        // La barra es decorativa: el valor va en texto al lado, que es lo
        // que leen los lectores de pantalla.
        aria-hidden="true"
      >
        <div className="h-full rounded-full bg-barra" style={{ width: `${ancho}%` }} />
      </div>
      <span
        className={`tabular-nums ${
          etiqueta === SIN_DATOS
            ? 'text-texto-2'
            : 'text-texto'
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
        className="flex items-center gap-1 text-texto hover:text-enlace"
      >
        {children}
        <span aria-hidden="true" className="text-xs">
          {activa ? (orden.descendente ? '▼' : '▲') : '↕'}
        </span>
      </button>
    </th>
  );
}
