'use client';

import Link from 'next/link';
import { useState } from 'react';
import { clasesDeBoton } from '@/components/ui/Boton';
import { ChipEstado } from '@/components/ui/ChipEstado';
import { AlertaError, CLASE_CONTROL, CLASE_ETIQUETA } from '@/components/ui/form';
import { RUTA_MODERACION_ADMIN } from '@/features/auth/model/rutas';
import { etiquetaDeMotivo } from '@/features/reportes/model/denuncia';
import { tituloVisible } from '@/lib/types/tituloYSeveridad';
import { useBandejaModeracion } from '../hooks/useBandejaModeracion';
import {
  conVista,
  descripcionDeVista,
  esVistaDeBandeja,
  etiquetaDeVista,
  etiquetasDeVisibilidad,
  fechaDeModeracion,
  FILTROS_MODERACION_INICIALES,
  navegacionDe,
  VISTAS_DE_BANDEJA,
} from '../model/moderacion';
import type { FilaDeModeracion, FiltrosDeModeracion, PaginaDeModeracion } from '../model/tipos';

/**
 * NC-11b (D-15): bandeja de moderacion del ADMIN. Lista paginada en el
 * servidor con cuatro vistas: las denuncias pendientes (por defecto),
 * atendidas y desestimadas, y «Ocultos» (decision del usuario del 30/10): los
 * reportes con el reporte o la foto ocultos, tengan denuncias o no. Cada fila
 * lleva al detalle, donde estan las acciones.
 */
export function BandejaModeracion() {
  const [filtros, setFiltros] = useState<FiltrosDeModeracion>(FILTROS_MODERACION_INICIALES);
  const carga = useBandejaModeracion(filtros);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="vista-moderacion" className={CLASE_ETIQUETA}>
          Ver
        </label>
        <select
          id="vista-moderacion"
          value={filtros.vista}
          onChange={(e) => {
            const valor = e.target.value;
            if (esVistaDeBandeja(valor)) setFiltros((f) => conVista(f, valor));
          }}
          className={`${CLASE_CONTROL} max-w-xs`}
        >
          {VISTAS_DE_BANDEJA.map((vista) => (
            <option key={vista} value={vista}>
              {etiquetaDeVista(vista)}
            </option>
          ))}
        </select>
        <p className="text-sm text-texto-2">{descripcionDeVista(filtros.vista)}</p>
      </div>

      {carga.estado === 'cargando' && <p className="text-texto-2">Cargando…</p>}
      {carga.estado === 'error' && (
        <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />
      )}
      {carga.recargando && (
        <p role="status" className="text-sm text-texto-2">
          Actualizando…
        </p>
      )}
      {carga.estado === 'listo' && (
        <ListaDeFilas
          pagina={carga.datos}
          vistaOcultos={filtros.vista === 'OCULTOS'}
          onPagina={(pagina) => setFiltros((f) => ({ ...f, pagina }))}
        />
      )}
    </div>
  );
}

function ListaDeFilas({
  pagina,
  vistaOcultos,
  onPagina,
}: {
  pagina: PaginaDeModeracion;
  vistaOcultos: boolean;
  onPagina: (pagina: number) => void;
}) {
  if (pagina.filas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-control border border-dashed border-linea-campo p-8 text-center text-texto-2">
        <p>{vistaOcultos ? 'No hay reportes ni fotos ocultos.' : 'No hay reportes con denuncias en este estado.'}</p>
        {pagina.pagina > 0 && (
          <button type="button" onClick={() => onPagina(0)} className={clasesDeBoton('secundario', 'compacto')}>
            Volver a la primera página
          </button>
        )}
      </div>
    );
  }
  const nav = navegacionDe(pagina);
  return (
    <>
      <p className="text-sm text-texto-2">
        {pagina.total} {pagina.total === 1 ? 'reporte' : 'reportes'}
      </p>
      <ul className="flex flex-col gap-3">
        {pagina.filas.map((fila) => (
          <FilaDeBandeja key={fila.reporteId} fila={fila} />
        ))}
      </ul>
      <nav aria-label="Paginación" className="flex items-center gap-3 text-sm">
        <button
          type="button"
          disabled={!nav.hayAnterior}
          onClick={() => onPagina(pagina.pagina - 1)}
          className={clasesDeBoton('secundario', 'compacto')}
        >
          Anterior
        </button>
        <span className="text-texto-2">{nav.texto}</span>
        <button
          type="button"
          disabled={!nav.haySiguiente}
          onClick={() => onPagina(pagina.pagina + 1)}
          className={clasesDeBoton('secundario', 'compacto')}
        >
          Siguiente
        </button>
      </nav>
    </>
  );
}

function FilaDeBandeja({ fila }: { fila: FilaDeModeracion }) {
  const visibilidad = etiquetasDeVisibilidad(fila);
  const motivos = Object.entries(fila.porMotivo)
    .sort(([, a], [, b]) => b - a)
    .map(([motivo, cantidad]) => `${etiquetaDeMotivo(motivo)} (${cantidad})`);
  return (
    <li>
      <Link
        href={`${RUTA_MODERACION_ADMIN}/${fila.reporteId}`}
        className="flex flex-col gap-2 rounded-control border border-linea bg-superficie p-4 transition hover:border-primario"
      >
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-texto">{tituloVisible(fila.titulo)}</strong>
          <ChipEstado estado={fila.estado} />
          {visibilidad.map((etiqueta) => (
            <span
              key={etiqueta}
              className="rounded-full border border-aviso-borde bg-aviso-fondo px-2 py-0.5 text-xs font-semibold text-aviso-texto"
            >
              {etiqueta}
            </span>
          ))}
        </span>
        <span className="text-sm text-texto-2">
          #{fila.reporteId} · {fila.distritoNombre ?? 'Sin distrito'}
          {fila.tieneFoto ? ' · con foto' : ' · sin foto'}
        </span>
        <span className="text-sm text-texto">
          {fila.totalDenuncias === 0
            ? 'Sin denuncias'
            : `${fila.totalDenuncias} ${fila.totalDenuncias === 1 ? 'denuncia' : 'denuncias'}${
                motivos.length > 0 ? `: ${motivos.join(', ')}` : ''
              }`}
        </span>
        {fila.ultimaDenuncia && (
          <span className="text-xs text-texto-2">
            Última denuncia: {fechaDeModeracion(fila.ultimaDenuncia)}
          </span>
        )}
      </Link>
    </li>
  );
}
