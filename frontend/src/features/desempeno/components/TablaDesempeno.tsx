'use client';

import { alternarOrden, anchoBarra, DATOS_INSUFICIENTES, SIN_DATOS, type ColumnaOrden, type Orden } from '../model/formato';
import {
  municipalidadDistinta,
  ordenarGestion,
  posiciones,
  tasaRepresentativa,
  textoConteo,
  textoSatisfaccion,
  textoTasa,
  textoTiempo,
  type KpiGestion,
} from '../model/gestion';

/**
 * Desempeño de cada municipalidad en un periodo de gestión (NC-06, sobre la
 * tabla de US-18/US-20).
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
 *
 * Una fila sin valor en la columna de orden («Sin datos» o «Datos
 * insuficientes») va al final y no lleva número de puesto.
 */
interface Props {
  filas: KpiGestion[];
  orden: Orden;
  onOrdenar: (orden: Orden) => void;
  /** US-19: distritos marcados para comparar. */
  comparados: number[];
  onAlternarComparacion: (distritoId: number) => void;
  /** Para el título accesible de la tabla: «2023–2026», «2023–2026 · Bache». */
  contexto: string;
}

export function TablaDesempeno({ filas, orden, onOrdenar, comparados, onAlternarComparacion, contexto }: Props) {
  const ordenadas = ordenarGestion(filas, orden);
  const puestos = posiciones(ordenadas, orden);

  return (
    <div className="flex flex-col gap-1.5">
      {/* QA-1 M-12: en el movil la tabla no cabe y obligaba a desplazarse en
          horizontal sin ninguna pista. Es texto visible solo en pantallas
          angostas y NO la descripcion accesible de la region: con
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
        <table className="w-full min-w-[50rem] border-collapse text-sm">
          <caption className="sr-only">
            Desempeño de cada municipalidad de Lima Metropolitana en el periodo de gestión {contexto}:
            tasa de resolución, reportes resueltos sobre válidos, tiempo promedio de atención en días
            y satisfacción ciudadana
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
                Resueltos / válidos
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
            {ordenadas.map((fila, indice) => {
              const municipalidad = municipalidadDistinta(fila);
              const puesto = puestos[indice];
              return (
                <tr key={fila.distritoId} className="border-b border-linea last:border-0">
                  <td className="px-2 py-2 text-texto-2 tabular-nums">
                    {puesto ?? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Sin puesto</span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {/* No se deshabilita al llegar al maximo: al intentar marcar un quinto
                        distrito se explica por que no se agrega (US-19). */}
                    <input
                      type="checkbox"
                      checked={comparados.includes(fila.distritoId)}
                      onChange={() => onAlternarComparacion(fila.distritoId)}
                      aria-label={`Comparar ${fila.distritoNombre}`}
                      className="size-4"
                    />
                  </td>
                  <th scope="row" className="px-2 py-2 text-left font-medium text-texto">
                    {fila.distritoNombre}
                    {municipalidad && (
                      <span className="block text-xs font-normal text-texto-2">{municipalidad}</span>
                    )}
                  </th>
                  <td className="px-2 py-2">
                    <BarraTasa fila={fila} />
                  </td>
                  <td className="px-2 py-2 tabular-nums text-texto">{textoConteo(fila)}</td>
                  <Celda valor={textoTiempo(fila)} />
                  <Celda valor={textoSatisfaccion(fila)}>
                    {fila.totalCalificaciones > 0 && (
                      <span className="ml-1 text-xs text-texto-2">
                        ({fila.totalCalificaciones.toLocaleString('es-PE')})
                      </span>
                    )}
                  </Celda>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** «Sin datos» y «Datos insuficientes» en el color secundario: no son cifras. */
function sinCifra(valor: string): boolean {
  return valor === SIN_DATOS || valor === DATOS_INSUFICIENTES;
}

function Celda({ valor, children }: { valor: string; children?: React.ReactNode }) {
  return (
    <td className={`px-2 py-2 tabular-nums ${sinCifra(valor) ? 'text-texto-2' : 'text-texto'}`}>
      {valor}
      {children}
    </td>
  );
}

function BarraTasa({ fila }: { fila: KpiGestion }) {
  const tasa = tasaRepresentativa(fila);
  const etiqueta = textoTasa(fila);

  return (
    <div className="flex items-center gap-2">
      <div
        // DIS-1: sin cifra que dibujar, la pista va punteada, para no parecer
        // «0 %» (pista llena y vacía): null no es cero. Tampoco se dibuja una
        // tasa con datos insuficientes.
        className={`h-2 w-24 shrink-0 overflow-hidden rounded-full ${
          tasa == null ? 'border border-dashed border-linea-campo' : 'bg-pista'
        }`}
        // La barra es decorativa: el valor va en texto al lado, que es lo
        // que leen los lectores de pantalla.
        aria-hidden="true"
      >
        <div className="h-full rounded-full bg-barra" style={{ width: `${anchoBarra(tasa)}%` }} />
      </div>
      <span className={`tabular-nums ${sinCifra(etiqueta) ? 'text-texto-2' : 'text-texto'}`}>{etiqueta}</span>
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
        className="flex min-h-objetivo items-center gap-1 text-left text-texto hover:text-enlace"
      >
        {children}
        <span aria-hidden="true" className="text-xs">
          {activa ? (orden.descendente ? '▼' : '▲') : '↕'}
        </span>
      </button>
    </th>
  );
}
