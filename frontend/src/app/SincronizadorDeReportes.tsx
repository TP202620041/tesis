'use client';

import { usePathname } from 'next/navigation';
import {
  useHaySesion,
  useIdentidadEnSegundoPlano,
} from '@/features/auth/hooks/useSesionEnSegundoPlano';
import {
  AvisoDeEnvioExitoso,
  AvisoPendientesSinSesion,
  AvisoReportesIncompletos,
  DialogoCierreConPendientes,
} from '@/features/reportes/components/AvisosDeLaCola';
import { useConfirmacionAlCerrarSesion } from '@/features/reportes/hooks/useConfirmacionAlCerrarSesion';
import {
  useCantidadDeIncompletos,
  useEnviosDesdeLaCola,
  useResumenDeLaCola,
  useSincronizacionAutomatica,
} from '@/features/reportes/hooks/useColaOffline';

/**
 * US-06: cola offline en cualquier pantalla. Solo compone (por eso vive en
 * `app/`): junta la sesion de `auth` con la cola de `reportes`.
 *
 * - Cola vacia: no consulta la sesion (solo queda, con sesion, la region
 *   vacia del aviso de envio exitoso).
 * - Hay reenviables y no hay token: aviso no modal con enlace al login.
 * - Hay token: averigua el usuario con `/me` UNA vez por sesion y sin
 *   redirigir nunca (`useIdentidadEnSegundoPlano`). El reenvio automatico
 *   solo arranca si hay reenviables de ESE usuario, y solo mientras siga la
 *   sesion en la que se identifico. Si `/me` da 401, el token se borra y se
 *   vuelve al caso anterior (aviso); si falla por red, se vuelve a preguntar
 *   al volver la conexion.
 * - Con sesion y reportes propios en cola: al cerrar sesion pregunta si se
 *   conservan o se descartan (dispositivo compartido).
 * - Con sesion y reportes propios incompletos (NC-02): aviso no modal con
 *   enlace a «Pendiente de envío» para completarlos.
 * - Con sesion, cuando la cola envia sola reportes (US-06 Esc. 2): aviso de
 *   envio exitoso, aunque la cola haya quedado vacia.
 */
export function SincronizadorDeReportes() {
  const cola = useResumenDeLaCola();
  const haySesion = useHaySesion();
  const ruta = usePathname();

  return (
    <>
      {/* US-06 Esc. 2: fuera de la condicion de la cola, porque al enviarse
          el ultimo reporte la cola queda vacia y el aviso tiene que seguir. */}
      {haySesion && <EnvioExitoso />}
      {cola.total > 0 &&
        (haySesion ? (
          <ConSesion ruta={ruta} />
        ) : (
          <AvisoPendientesSinSesion cantidad={cola.reenviables} ruta={ruta} />
        ))}
    </>
  );
}

function EnvioExitoso() {
  const { enviados, cerrar } = useEnviosDesdeLaCola();
  return <AvisoDeEnvioExitoso enviados={enviados} onCerrar={cerrar} />;
}

function ConSesion({ ruta }: { ruta: string }) {
  const identidad = useIdentidadEnSegundoPlano();
  useSincronizacionAutomatica(
    identidad ? { usuarioId: identidad.usuario.id, generacion: identidad.generacion } : null,
  );
  if (!identidad) return null;
  return (
    <>
      <AvisoDeIncompletos usuarioId={identidad.usuario.id} ruta={ruta} />
      <ConfirmacionAlCerrar usuarioId={identidad.usuario.id} />
    </>
  );
}

function AvisoDeIncompletos({ usuarioId, ruta }: { usuarioId: number; ruta: string }) {
  const cantidad = useCantidadDeIncompletos(usuarioId);
  return <AvisoReportesIncompletos cantidad={cantidad} ruta={ruta} usuarioId={usuarioId} />;
}

function ConfirmacionAlCerrar({ usuarioId }: { usuarioId: number }) {
  const { preguntando, desglose, conservar, descartar } =
    useConfirmacionAlCerrarSesion(usuarioId);
  if (preguntando === null) return null;
  return (
    <DialogoCierreConPendientes
      cantidad={preguntando}
      seEnviaran={desglose.seEnviaran}
      requierenAccion={desglose.requierenAccion}
      onConservar={conservar}
      onDescartar={() => void descartar()}
    />
  );
}
