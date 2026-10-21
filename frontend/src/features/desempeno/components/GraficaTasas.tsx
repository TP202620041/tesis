import { anchoBarra, formatearTasa } from '../model/formato';
import type { DistritoComparado } from '../model/comparacion';

/** Nombre | barra | valor: la misma rejilla para las barras y la escala. */
const FILA = 'grid grid-cols-[minmax(6rem,10rem)_1fr_4.5rem] items-center gap-2';

/**
 * US-19: barras horizontales de la tasa de resolucion de los distritos
 * comparados.
 *
 * Sin libreria de graficos, igual que la barra de `TablaDesempeno`: con 2 a 4
 * barras de una sola magnitud basta CSS, y se adapta solo al ancho del
 * telefono. Un solo color (no una escala rojo-verde): la interfaz no inventa
 * que tasa es "mala". Cada barra lleva su valor escrito; un distrito sin
 * datos no tiene barra y dice «Sin datos», nunca 0 %.
 *
 * Para lectores de pantalla la grafica es una sola imagen con un resumen en
 * `aria-label`; el detalle completo esta en la tabla de la comparacion.
 */
export function GraficaTasas({ distritos }: { distritos: DistritoComparado[] }) {
  const resumen = distritos
    .map((d) => `${d.nombre}: ${formatearTasa(d.fila?.tasaResolucion)}`)
    .join('; ');

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Tasa de resolución
      </figcaption>
      <div
        role="img"
        aria-label={`Gráfica de barras de la tasa de resolución. ${resumen}.`}
        className="flex flex-col gap-3"
      >
        {distritos.map((d) => {
          const tasa = d.fila?.tasaResolucion;
          const etiqueta = formatearTasa(tasa);
          return (
            <div
              key={d.distritoId}
              aria-hidden="true"
              title={`${d.nombre}: ${etiqueta}`}
              className={`${FILA} text-sm`}
            >
              <span className="truncate text-slate-700 dark:text-slate-300">{d.nombre}</span>
              <div className="relative h-3 border-l border-slate-300 dark:border-slate-600">
                {tasa != null && (
                  <div
                    className="h-full rounded-r bg-sky-600 dark:bg-sky-400"
                    style={{ width: `${anchoBarra(tasa)}%` }}
                  />
                )}
              </div>
              <span
                className={`text-right tabular-nums ${
                  tasa == null
                    ? 'text-slate-400 dark:text-slate-500'
                    : 'font-medium text-slate-900 dark:text-slate-100'
                }`}
              >
                {etiqueta}
              </span>
            </div>
          );
        })}
      </div>
      {/* Escala: la misma rejilla que las barras, para que 0 y 100 caigan en su sitio. */}
      <div aria-hidden="true" className={`${FILA} text-xs text-slate-400 dark:text-slate-500`}>
        <span />
        <span className="flex justify-between">
          <span>0 %</span>
          <span>100 %</span>
        </span>
        <span />
      </div>
    </figure>
  );
}
