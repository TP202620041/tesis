'use client';

import { useFotoModerada } from '../hooks/useFotoModerada';

/**
 * NC-11b: la foto del reporte en el area del ADMIN, aunque este oculta. Se
 * trae con el token y se muestra como `blob:` (`useFotoModerada`); si esta
 * oculta se dice encima, para que el ADMIN sepa que el publico no la ve.
 */
export function FotoModerada({
  reporteId,
  tieneFoto,
  fotoOculta,
  titulo,
}: {
  reporteId: number;
  tieneFoto: boolean;
  fotoOculta: boolean;
  titulo: string;
}) {
  const foto = useFotoModerada(reporteId, tieneFoto, fotoOculta ? 1 : 0);

  if (!tieneFoto) {
    return <p className="rounded-control bg-superficie-2 px-3 py-2 text-sm text-texto-2">El reporte no tiene foto.</p>;
  }
  if (foto.fallo) {
    return (
      <p role="alert" className="rounded-control bg-superficie-2 px-3 py-2 text-sm text-texto-2">
        No se pudo cargar la foto.
      </p>
    );
  }
  if (!foto.src) {
    return <p className="text-sm text-texto-2">Cargando la foto…</p>;
  }
  return (
    <figure className="flex flex-col gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={foto.src}
        alt={`Foto del reporte: ${titulo}`}
        className="max-h-96 w-full rounded-control border border-linea object-contain bg-superficie-2"
      />
      {fotoOculta && (
        <figcaption className="text-sm font-medium text-aviso-texto">
          Esta foto está oculta: el público no la ve. Solo el ADMIN puede verla aquí.
        </figcaption>
      )}
    </figure>
  );
}
