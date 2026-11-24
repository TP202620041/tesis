import { useId, type ReactNode } from 'react';
import type { Ilustracion } from '../model/pasos';

/**
 * US-24: ilustración esquemática de la pantalla que explica cada paso de la
 * guía. Es un dibujo con los tokens del tema (`fill-superficie`,
 * `stroke-linea`…), no una captura en PNG: se adapta al tema claro, oscuro y
 * de alto contraste, no pide nada a otro origen (la CSP no cambia) y no
 * queda desactualizada con cada ajuste visual.
 *
 * Para el lector de pantalla es una imagen con su descripción (`role="img"`
 * y `<title>`); los trazos internos no se anuncian.
 */
export function IlustracionDePaso({ tipo, descripcion }: { tipo: Ilustracion; descripcion: string }) {
  const idTitulo = useId();
  return (
    <svg
      viewBox="0 0 200 160"
      role="img"
      aria-labelledby={idTitulo}
      className="h-auto w-full max-w-xs"
    >
      <title id={idTitulo}>{descripcion}</title>
      {/* Marco de teléfono común a todas. */}
      <rect x="50" y="4" width="100" height="152" rx="12" className="fill-superficie stroke-linea-campo" strokeWidth="2" />
      <rect x="50" y="4" width="100" height="18" rx="12" className="fill-primario" />
      <rect x="50" y="14" width="100" height="8" className="fill-primario" />
      <circle cx="62" cy="13" r="3" className="fill-foco" />
      {CONTENIDO[tipo]}
    </svg>
  );
}

const linea = (x: number, y: number, ancho: number, clase = 'fill-linea') => (
  <rect x={x} y={y} width={ancho} height="5" rx="2.5" className={clase} />
);

const CONTENIDO: Record<Ilustracion, ReactNode> = {
  mapa: (
    <g>
      <rect x="56" y="28" width="88" height="110" rx="4" className="fill-superficie-2" />
      <path d="M56 70 L144 52 M70 28 L96 138 M56 110 L144 96" className="stroke-linea" strokeWidth="4" fill="none" />
      <path d="M78 66 a7 7 0 1 1 14 0 c0 6 -7 12 -7 12 s-7 -6 -7 -12z" className="fill-pendiente" />
      <path d="M112 88 a7 7 0 1 1 14 0 c0 6 -7 12 -7 12 s-7 -6 -7 -12z" className="fill-recibido" />
      <path d="M96 114 a7 7 0 1 1 14 0 c0 6 -7 12 -7 12 s-7 -6 -7 -12z" className="fill-resuelto" />
      <rect x="60" y="32" width="50" height="12" rx="6" className="fill-superficie stroke-linea-campo" />
      {linea(65, 35.5, 30, 'fill-texto-2')}
      <rect x="56" y="140" width="88" height="10" className="fill-superficie" />
    </g>
  ),
  cuenta: (
    <g>
      {linea(62, 32, 50, 'fill-texto')}
      {linea(62, 48, 24, 'fill-texto-2')}
      <rect x="62" y="56" width="76" height="14" rx="4" className="fill-superficie stroke-linea-campo" />
      {linea(62, 78, 30, 'fill-texto-2')}
      <rect x="62" y="86" width="76" height="14" rx="4" className="fill-superficie stroke-linea-campo" />
      <circle cx="70" cy="93" r="2" className="fill-texto" />
      <circle cx="77" cy="93" r="2" className="fill-texto" />
      <circle cx="84" cy="93" r="2" className="fill-texto" />
      <rect x="62" y="112" width="76" height="16" rx="4" className="fill-primario" />
      {linea(82, 117.5, 36, 'fill-sobre-primario')}
    </g>
  ),
  reportar: (
    <g>
      <rect x="62" y="30" width="76" height="40" rx="4" className="fill-superficie-2 stroke-linea" />
      <path d="M86 58 l10 -12 l8 9 l6 -6 l10 9z" className="fill-texto-2" />
      <circle cx="116" cy="40" r="4" className="fill-texto-2" />
      {linea(62, 78, 28, 'fill-texto-2')}
      <rect x="62" y="86" width="76" height="12" rx="4" className="fill-superficie stroke-linea-campo" />
      <path d="M68 89 a3 3 0 1 1 6 0 c0 3 -3 6 -3 6 s-3 -3 -3 -6z" className="fill-pendiente" />
      {linea(78, 89.5, 40)}
      {linea(62, 104, 28, 'fill-texto-2')}
      <rect x="62" y="112" width="76" height="12" rx="4" className="fill-superficie stroke-linea-campo" />
      {linea(66, 115.5, 30, 'fill-texto')}
      <rect x="62" y="132" width="76" height="16" rx="4" className="fill-primario" />
      {linea(84, 137.5, 32, 'fill-sobre-primario')}
    </g>
  ),
  'sin-conexion': (
    <g>
      <rect x="58" y="30" width="84" height="40" rx="5" className="fill-aviso-fondo stroke-aviso-borde" />
      <path d="M68 46 q12 -10 24 0 M72 51 q8 -6 16 0" className="stroke-aviso-texto" strokeWidth="2.5" fill="none" />
      <path d="M66 40 L94 60" className="stroke-aviso-texto" strokeWidth="2.5" />
      {linea(100, 42, 34, 'fill-aviso-texto')}
      {linea(100, 52, 24, 'fill-aviso-texto')}
      <path d="M100 78 v14 m-6 -6 l6 6 l6 -6" className="stroke-texto-2" strokeWidth="2.5" fill="none" />
      <rect x="58" y="98" width="84" height="40" rx="5" className="fill-exito-fondo stroke-exito-borde" />
      <circle cx="78" cy="118" r="9" className="fill-exito-texto" />
      <path d="M74 118 l3 3 l6 -6" className="stroke-exito-fondo" strokeWidth="2.5" fill="none" />
      {linea(94, 110, 40, 'fill-exito-texto')}
      {linea(94, 120, 30, 'fill-exito-texto')}
    </g>
  ),
  seguimiento: (
    <g>
      {linea(62, 32, 56, 'fill-texto')}
      <rect x="62" y="42" width="34" height="10" rx="5" className="fill-en-proceso-fondo stroke-chip-borde" />
      <path d="M68 70 V136" className="stroke-linea-campo" strokeWidth="2" />
      <circle cx="68" cy="70" r="5" className="fill-pendiente" />
      {linea(80, 67.5, 44, 'fill-texto')}
      <circle cx="68" cy="94" r="5" className="fill-recibido" />
      {linea(80, 91.5, 50, 'fill-texto')}
      {linea(80, 100, 34)}
      <circle cx="68" cy="122" r="5" className="fill-en-proceso" />
      {linea(80, 119.5, 40, 'fill-texto')}
      {linea(80, 128, 46)}
    </g>
  ),
  desempeno: (
    <g>
      {linea(62, 32, 50, 'fill-texto')}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          {linea(62, 50 + i * 18, 22, 'fill-texto-2')}
          <rect x="90" y={49 + i * 18} width="48" height="7" rx="3.5" className="fill-pista" />
          <rect x="90" y={49 + i * 18} width={44 - i * 8} height="7" rx="3.5" className="fill-barra" />
        </g>
      ))}
      <path d="M64 146 l3 -7 l3 7 l-6 -4.5 h6z" className="fill-foco" />
      <path d="M74 146 l3 -7 l3 7 l-6 -4.5 h6z" className="fill-foco" />
      <path d="M84 146 l3 -7 l3 7 l-6 -4.5 h6z" className="fill-foco" />
    </g>
  ),
};
