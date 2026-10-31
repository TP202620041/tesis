'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Flag } from 'lucide-react';
import { Aviso } from '@/components/ui/Aviso';
import { clasesDeBoton } from '@/components/ui/Boton';
import { Dialogo } from '@/components/ui/dialogo';
import { AlertaError, Boton, CLASE_CONTROL_INVALIDO, CLASE_ETIQUETA } from '@/components/ui/form';
import { Icono } from '@/components/ui/Icono';
import type { MotivoDenuncia } from '@/lib/types/domain';
import { useDenunciarReporte } from '../hooks/useDenunciarReporte';
import { useEsReportePropio } from '../hooks/useEsReportePropio';
import {
  erroresDeDenuncia,
  ETIQUETA_DE_MOTIVO,
  MAX_DETALLE_DENUNCIA,
  MOTIVOS_PARA_DENUNCIAR,
  TEXTOS_DENUNCIA,
} from '../model/denuncia';

/**
 * NC-11b (D-15): «Denunciar contenido» en el detalle publico de un reporte.
 *
 * - `puedeDenunciar`: la pagina lo decide con la sesion (solo el CIUDADANO;
 *   el funcionario gestiona y el ADMIN modera). Sin sesion (`sinSesion`), un
 *   enlace lleva al login y vuelve a este reporte.
 * - En un reporte PROPIO no se ofrece (`useEsReportePropio`): el backend lo
 *   rechazaria con 409 `DENUNCIA_PROPIA`. Mientras no se sabe, tampoco: un
 *   boton que aparece y desaparece confunde mas que uno que tarda un poco.
 * - El dialogo pide el motivo (obligatorio) y un detalle opcional. Tras el
 *   201 se agradece y no se vuelve a ofrecer en esta visita; los 409 llegan
 *   con el texto del contrato por `codigo` (`model/denuncia.ts`).
 *
 * Quien denuncia no cambia nada a la vista: la denuncia va a la bandeja del
 * ADMIN, y el autor del reporte nunca sabe quien denuncio.
 */
export function DenunciarContenido({
  reporteId,
  puedeDenunciar,
  sinSesion,
}: {
  reporteId: number;
  puedeDenunciar: boolean;
  sinSesion: boolean;
}) {
  const propio = useEsReportePropio(reporteId, puedeDenunciar);

  if (sinSesion) {
    return (
      <p className="text-sm">
        <Link
          href={`/login?redirect=${encodeURIComponent(`/reportes/${reporteId}`)}`}
          className="text-enlace hover:underline"
        >
          {TEXTOS_DENUNCIA.sinSesion}
        </Link>
      </p>
    );
  }
  if (!puedeDenunciar || propio !== false) return null;
  return <BotonYDialogo reporteId={reporteId} />;
}

function BotonYDialogo({ reporteId }: { reporteId: number }) {
  const [abierto, setAbierto] = useState(false);
  const { denunciar, enviando, error, registrada, reiniciar } = useDenunciarReporte(reporteId);

  if (registrada) {
    return (
      <Aviso tono="exito" rol="status">
        <p>{TEXTOS_DENUNCIA.gracias}</p>
      </Aviso>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        className={`${clasesDeBoton('texto', 'compacto')} self-start`}
      >
        <Icono icono={Flag} tamano={16} />
        {TEXTOS_DENUNCIA.boton}
      </button>
      <Dialogo
        abierto={abierto}
        alCerrar={() => {
          setAbierto(false);
          if (error) reiniciar();
        }}
        titulo={TEXTOS_DENUNCIA.titulo}
      >
        <FormularioDenuncia
          enviando={enviando}
          error={error}
          onEnviar={async (motivo, detalle) => {
            if (await denunciar({ motivo, detalle })) setAbierto(false);
          }}
        />
      </Dialogo>
    </>
  );
}

function FormularioDenuncia({
  enviando,
  error,
  onEnviar,
}: {
  enviando: boolean;
  error: { mensaje: string; definitivo: boolean } | null;
  onEnviar: (motivo: MotivoDenuncia, detalle: string) => Promise<void>;
}) {
  const idBase = useId();
  const idDetalle = `${idBase}-detalle`;
  const idErrores = `${idBase}-errores`;
  const [motivo, setMotivo] = useState<MotivoDenuncia | null>(null);
  const [detalle, setDetalle] = useState('');
  const [erroresLocales, setErroresLocales] = useState<string[]>([]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const errores = erroresDeDenuncia({ motivo, detalle });
    setErroresLocales(errores);
    if (errores.length > 0 || !motivo) return;
    await onEnviar(motivo, detalle);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-texto-2">{TEXTOS_DENUNCIA.explicacion}</p>

      {error && <AlertaError mensaje={error.mensaje} />}
      {erroresLocales.length > 0 && (
        <AlertaError mensaje="Revisa la denuncia:" detalles={erroresLocales} />
      )}

      {/* Radios: una eleccion entre opciones excluyentes, usable con teclado
          y lector de pantalla. */}
      <fieldset className="flex flex-col gap-2">
        <legend className={CLASE_ETIQUETA}>Motivo</legend>
        {MOTIVOS_PARA_DENUNCIAR.map((valor) => (
          <label key={valor} className="flex min-h-objetivo items-center gap-2 text-sm text-texto">
            <input
              type="radio"
              name={`${idBase}-motivo`}
              value={valor}
              checked={motivo === valor}
              onChange={() => setMotivo(valor)}
              disabled={error?.definitivo}
              className="size-4 accent-primario"
            />
            {ETIQUETA_DE_MOTIVO[valor]}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idDetalle} className={CLASE_ETIQUETA}>
          Detalle <span className="font-normal text-texto-2">(opcional)</span>
        </label>
        <textarea
          id={idDetalle}
          rows={3}
          maxLength={MAX_DETALLE_DENUNCIA}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          disabled={error?.definitivo}
          placeholder="¿Qué viste? Esto solo lo lee el equipo de Ciudad Viva."
          aria-describedby={erroresLocales.length > 0 ? idErrores : undefined}
          className={`bg-superficie text-texto rounded-control border border-linea-campo px-3 py-2 text-sm ${CLASE_CONTROL_INVALIDO}`}
        />
        <p id={idErrores} className="text-xs text-texto-2">
          {detalle.trim().length} / {MAX_DETALLE_DENUNCIA}
        </p>
      </div>

      {!error?.definitivo && (
        <Boton cargando={enviando} disabled={motivo === null}>
          Enviar denuncia
        </Boton>
      )}
    </form>
  );
}
