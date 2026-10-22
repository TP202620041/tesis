'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Aviso } from '@/components/ui/Aviso';
import { clasesDeBoton } from '@/components/ui/Boton';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { useReportesQueApoyas } from '../hooks/useReportesQueApoyas';
import { ANCLA_REPORTES_QUE_APOYAS, enlaceDeReporteApoyado } from '../model/apoyos';
import {
  CLASES_FILA_DE_REPORTE,
  CLASES_FILA_DE_REPORTE_ENLACE,
  ResumenDeReporteEnFila,
} from './ResumenDeReporteEnFila';

/**
 * QA-1 M-6 (US-09): «Reportes que apoyas», los de otros vecinos a los que el
 * ciudadano se adhirió. **Solo lectura**: sin editar, retirar ni calificar
 * (son del creador; el backend los rechaza con 403), así que cada fila lleva
 * al detalle público y no a `/mis-reportes/[id]`. Un CANCELADO no tiene
 * detalle público (404): su fila no enlaza y explica por qué.
 *
 * `arribaYaCargo`: si lo de arriba en la página (los reportes propios) ya
 * cargó. Al llegar desde «Ver los reportes que apoyas» (la confirmación de
 * una adhesión, con el ancla en la URL), el foco va al título de la sección
 * cuando ya no se mueve: el ancla no existe hasta que la sección carga, así
 * que Next no puede desplazarse a ella por su cuenta.
 */
export function ReportesQueApoyas({ arribaYaCargo }: { arribaYaCargo: boolean }) {
  const carga = useReportesQueApoyas();
  const cargando = carga.estado === 'cargando';
  const reportes = carga.datos ?? [];

  const titulo = useRef<HTMLHeadingElement>(null);
  const yaSeEnfoco = useRef(false);
  useEffect(() => {
    if (cargando || !arribaYaCargo || yaSeEnfoco.current) return;
    yaSeEnfoco.current = true;
    // El foco también desplaza la sección a la vista.
    if (window.location.hash === `#${ANCLA_REPORTES_QUE_APOYAS}`) titulo.current?.focus();
  }, [cargando, arribaYaCargo]);

  return (
    <section
      aria-labelledby={ANCLA_REPORTES_QUE_APOYAS}
      aria-busy={cargando}
      className="flex flex-col gap-3"
    >
      <header>
        <h2
          id={ANCLA_REPORTES_QUE_APOYAS}
          ref={titulo}
          tabIndex={-1}
          className="text-lg font-semibold text-texto"
        >
          Reportes que apoyas
        </h2>
        <p className="text-sm text-texto-2">
          Los de otros vecinos a los que te sumaste al reportar el mismo daño. Aquí ves en qué va
          cada uno; solo quien lo creó puede editarlo, retirarlo o calificar la atención, y es quien
          recibe los avisos.
        </p>
      </header>

      {cargando && <p className="text-texto-2">Cargando los reportes que apoyas…</p>}

      {carga.estado === 'error' && (
        <Aviso tono="error" rol="status">
          <p>No se pudieron cargar los reportes que apoyas.</p>
          <button
            type="button"
            onClick={carga.recargar}
            className={`${clasesDeBoton('secundario', 'compacto')} self-start`}
          >
            Reintentar
          </button>
        </Aviso>
      )}

      {carga.estado === 'listo' && reportes.length === 0 && (
        <EstadoVacio
          icono={Users}
          titulo="Todavía no apoyas reportes de otros vecinos"
          descripcion="Si reportas un daño que otro vecino ya reportó muy cerca, te sumas a su reporte en vez de crear uno repetido, y aparece aquí."
        />
      )}

      {reportes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {reportes.map((reporte) => {
            const enlace = enlaceDeReporteApoyado(reporte);
            return (
              <li key={reporte.id}>
                {enlace ? (
                  <Link href={enlace} className={CLASES_FILA_DE_REPORTE_ENLACE}>
                    <ResumenDeReporteEnFila reporte={reporte} />
                  </Link>
                ) : (
                  <div className={CLASES_FILA_DE_REPORTE}>
                    <ResumenDeReporteEnFila reporte={reporte}>
                      <span className="mt-1 block text-sm text-texto">
                        El vecino que lo creó lo retiró, así que la municipalidad no lo gestionará y
                        ya no tiene página pública.
                      </span>
                    </ResumenDeReporteEnFila>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
