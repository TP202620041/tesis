'use client';

import {
  UMBRAL_MINIMO_ESCALA,
  ladoDeCeldaEnMetros,
  type EntradaLeyendaCalor,
} from '../model/densidad';

/** Lo que la leyenda necesita de `useDensidadMapa`. */
export interface EstadoCapaCalor {
  leyenda: EntradaLeyendaCalor[];
  maximo: number;
  totalEnVista: number;
  celdaGrados: number;
  consultaHecha: boolean;
  /** Hay una consulta en vuelo (p. ej. tras cambiar un filtro); la capa anterior sigue dibujada. */
  cargando: boolean;
  error: string | null;
  sinReportesEnVista: boolean;
}

interface Props {
  marcadores: boolean;
  onCambiarMarcadores: (visible: boolean) => void;
  calor: boolean;
  onCambiarCalor: (visible: boolean) => void;
  capaCalor: EstadoCapaCalor;
}

export const MENSAJE_SIN_REPORTES_EN_ZONA = 'Sin reportes en esta zona con estos filtros';

/**
 * US-11: capas del mapa publico (marcadores y mapa de calor) y la leyenda de
 * la capa de calor.
 *
 * La leyenda no depende solo del color: cada nivel tiene nombre, cuantos
 * reportes significa y un circulo del mismo TAMANO con que se dibuja en el
 * mapa (accesibilidad, US-23). Como la escala es relativa a la vista, dice
 * tambien cual es el maximo de referencia.
 */
export function CapasDelMapa({
  marcadores,
  onCambiarMarcadores,
  calor,
  onCambiarCalor,
  capaCalor,
}: Props) {
  return (
    <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Capas del mapa
        </legend>
        <Casilla
          id="capa-marcadores"
          etiqueta="Marcadores de reportes"
          marcada={marcadores}
          onCambiar={onCambiarMarcadores}
        />
        <Casilla id="capa-calor" etiqueta="Mapa de calor" marcada={calor} onCambiar={onCambiarCalor} />
      </fieldset>

      {calor && <LeyendaCalor capa={capaCalor} />}
    </div>
  );
}

function Casilla({
  id,
  etiqueta,
  marcada,
  onCambiar,
}: {
  id: string;
  etiqueta: string;
  marcada: boolean;
  onCambiar: (marcada: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={marcada}
        onChange={(e) => onCambiar(e.target.checked)}
        className="size-4 accent-sky-600"
      />
      <label htmlFor={id} className="text-sm text-slate-700 dark:text-slate-200">
        {etiqueta}
      </label>
    </div>
  );
}

/**
 * Cambio de estado que se anuncia (`aria-live`): calculando, actualizando o
 * vacio. `null` si no hay nada que anunciar, o si hay error (ese va en su
 * propia alerta). El total de la vista NO va aqui: cambia con cada gesto del
 * mapa y anunciarlo cada vez seria ruido para un lector de pantalla.
 */
function cambioDeEstado(capa: EstadoCapaCalor): string | null {
  if (capa.error) return null;
  if (!capa.consultaHecha) return 'Calculando densidad…';
  if (capa.cargando) return 'Actualizando…';
  if (capa.sinReportesEnVista) return MENSAJE_SIN_REPORTES_EN_ZONA;
  return null;
}

function LeyendaCalor({ capa }: { capa: EstadoCapaCalor }) {
  const estado = cambioDeEstado(capa);
  const hayTotal = capa.consultaHecha && !capa.sinReportesEnVista && !capa.error;

  return (
    <section aria-labelledby="leyenda-calor-titulo" className="mt-3 flex flex-col gap-1.5">
      <h3 id="leyenda-calor-titulo" className="text-sm font-medium text-slate-700 dark:text-slate-200">
        Densidad de reportes
      </h3>
      {/* La region viva existe siempre (vacia si no hay nada que decir), para
          que el lector de pantalla anuncie el cambio cuando llegue. */}
      <p aria-live="polite" className="text-sm text-slate-600 empty:hidden dark:text-slate-400">
        {estado}
      </p>
      {hayTotal && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {capa.totalEnVista} {capa.totalEnVista === 1 ? 'reporte' : 'reportes'} en la vista
        </p>
      )}
      {capa.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {capa.error}
        </p>
      )}

      {capa.leyenda.length > 0 && (
        <>
          <ul aria-label="Leyenda del mapa de calor" className="flex flex-col gap-1.5">
            {capa.leyenda.map((nivel) => (
              <li key={nivel.nivel} className="flex items-center gap-2 text-sm">
                {/* Mismo color y tamaño que el círculo del mapa. El nivel más
                    oscuro lleva borde claro: sin él no se ve sobre el fondo del
                    modo oscuro. */}
                <span aria-hidden="true" className="flex w-6 shrink-0 justify-center">
                  <span
                    className={`inline-block rounded-full ${
                      nivel.nivel === 4 ? 'border border-slate-300 dark:border-slate-200' : ''
                    }`}
                    style={{
                      width: nivel.radio * 2,
                      height: nivel.radio * 2,
                      background: nivel.color,
                    }}
                  />
                </span>
                <span>
                  <span className="text-slate-900 dark:text-slate-100">{nivel.etiqueta}</span>
                  <span className="text-slate-600 dark:text-slate-400">: {nivel.texto}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Escala relativa a la zona con más reportes en la vista ({capa.maximo}), con un
            mínimo de {UMBRAL_MINIMO_ESCALA}: un reporte aislado no se muestra como densidad
            alta. Cada círculo agrupa los reportes de un área de unos{' '}
            {ladoDeCeldaEnMetros(capa.celdaGrados)} m de lado.
          </p>
        </>
      )}
    </section>
  );
}
