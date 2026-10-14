'use client';

export type VistaResultados = 'mapa' | 'lista';

const OPCIONES: { vista: VistaResultados; etiqueta: string }[] = [
  { vista: 'mapa', etiqueta: 'Mapa' },
  { vista: 'lista', etiqueta: 'Lista' },
];

/**
 * US-12: alterna entre el mapa y la lista de los mismos resultados.
 *
 * Son dos botones conmutables (`aria-pressed`) dentro de un grupo, no el
 * patrón ARIA de pestañas: con dos opciones, los botones dan la misma
 * información a un lector de pantalla sin exigir foco itinerante ni
 * navegación con flechas, y cada uno se alcanza con Tab.
 */
export function SelectorDeVista({
  vista,
  onElegir,
}: {
  vista: VistaResultados;
  onElegir: (vista: VistaResultados) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Vista de resultados"
      className="flex gap-1 border-b border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-800"
    >
      {OPCIONES.map(({ vista: opcion, etiqueta }) => {
        const activa = vista === opcion;
        return (
          <button
            key={opcion}
            type="button"
            aria-pressed={activa}
            onClick={() => onElegir(opcion)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              activa
                ? 'border-sky-600 text-sky-700 dark:text-sky-400'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {etiqueta}
          </button>
        );
      })}
    </div>
  );
}
