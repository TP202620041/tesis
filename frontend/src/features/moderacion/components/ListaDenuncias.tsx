import { etiquetaDeMotivo } from '@/features/reportes/model/denuncia';
import { claseDeEstadoDenuncia, etiquetaDeEstadoDenuncia, fechaDeModeracion } from '../model/moderacion';
import type { Denuncia } from '../model/tipos';

/**
 * NC-11b: las denuncias de un reporte, de la mas antigua a la mas nueva, con
 * quien denuncio. Esto solo lo ve el ADMIN: ni el autor ni la municipalidad
 * reciben nunca estos datos (el motivo que escribe el ADMIN tampoco debe
 * repetirlos, ver `AVISO_MOTIVO`).
 */
export function ListaDenuncias({ denuncias }: { denuncias: Denuncia[] }) {
  if (denuncias.length === 0) {
    return <p className="text-sm text-texto-2">Este reporte no tiene denuncias.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {denuncias.map((d) => (
        <li key={d.id} className="flex flex-col gap-2 rounded-control border border-linea bg-superficie p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-texto">{etiquetaDeMotivo(d.motivo)}</strong>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${claseDeEstadoDenuncia(d.estado)}`}>
              {etiquetaDeEstadoDenuncia(d.estado)}
            </span>
            <span className="text-xs text-texto-2">{fechaDeModeracion(d.createdAt)}</span>
          </div>
          {d.detalle && <p className="whitespace-pre-line text-texto">{d.detalle}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-texto-2">Denunció</dt>
            <dd className="break-all text-texto">
              {d.denunciante ? `${d.denunciante.nombre} · ${d.denunciante.email}` : 'Cuenta cerrada'}
            </dd>
            {d.resueltaEn && (
              <>
                <dt className="text-texto-2">Resuelta</dt>
                <dd className="text-texto">
                  {fechaDeModeracion(d.resueltaEn)}
                  {d.motivoResolucion ? ` · ${d.motivoResolucion}` : ''}
                </dd>
              </>
            )}
          </dl>
        </li>
      ))}
    </ul>
  );
}
