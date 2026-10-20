'use client';

import { usePathname } from 'next/navigation';
import {
  useHaySesion,
  useIdentidadEnSegundoPlano,
} from '@/features/auth/hooks/useSesionEnSegundoPlano';
import {
  AvisoPendientesSinSesion,
  DialogoCierreConPendientes,
} from '@/features/reportes/components/AvisosDeLaCola';
import { useConfirmacionAlCerrarSesion } from '@/features/reportes/hooks/useConfirmacionAlCerrarSesion';
import {
  useResumenDeLaCola,
  useSincronizacionAutomatica,
} from '@/features/reportes/hooks/useColaOffline';

/**
 * US-06: cola offline en cualquier pantalla. Solo compone (por eso vive en
 * `app/`): junta la sesion de `auth` con la cola de `reportes`.
 *
 * - Cola vacia: no hace nada, ni siquiera consulta la sesion.
 * - Hay reenviables y no hay token: aviso no modal con enlace al login.
 * - Hay token: averigua el usuario con `/me` UNA vez por sesion y sin
 *   redirigir nunca (`useIdentidadEnSegundoPlano`). El reenvio automatico
 *   solo arranca si hay reenviables de ESE usuario, y solo mientras siga la
 *   sesion en la que se identifico. Si `/me` da 401, el token se borra y se
 *   vuelve al caso anterior (aviso); si falla por red, se vuelve a preguntar
 *   al volver la conexion.
 * - Con sesion y reportes propios en cola: al cerrar sesion pregunta si se
 *   conservan o se descartan (dispositivo compartido).
 */
export function SincronizadorDeReportes() {
  const cola = useResumenDeLaCola();
  const haySesion = useHaySesion();
  const ruta = usePathname();

  if (cola.total === 0) return null;
  if (!haySesion) return <AvisoPendientesSinSesion cantidad={cola.reenviables} ruta={ruta} />;
  return <ConSesion />;
}

function ConSesion() {
  const identidad = useIdentidadEnSegundoPlano();
  useSincronizacionAutomatica(
    identidad ? { usuarioId: identidad.usuario.id, generacion: identidad.generacion } : null,
  );
  return identidad ? <ConfirmacionAlCerrar usuarioId={identidad.usuario.id} /> : null;
}

function ConfirmacionAlCerrar({ usuarioId }: { usuarioId: number }) {
  const { preguntando, conservar, descartar } = useConfirmacionAlCerrarSesion(usuarioId);
  if (preguntando === null) return null;
  return (
    <DialogoCierreConPendientes
      cantidad={preguntando}
      onConservar={conservar}
      onDescartar={() => void descartar()}
    />
  );
}
