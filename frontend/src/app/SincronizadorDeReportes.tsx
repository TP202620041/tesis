'use client';

import { usePathname } from 'next/navigation';
import { useSesion } from '@/features/auth/hooks/useSesion';
import {
  useHayReportesEnCola,
  useSincronizacionAutomatica,
} from '@/features/reportes/hooks/useColaOffline';

/**
 * US-06: reenvia los reportes guardados sin conexion, en cualquier pantalla.
 *
 * Solo compone (por eso vive en `app/`: junta la sesion de `auth` con la cola
 * de `reportes`). Mientras la cola esta vacia no hace nada, ni siquiera
 * consulta la sesion. Si hay pendientes, averigua quien es el usuario (solo
 * se envian los reportes de ESE ciudadano) y activa el reenvio automatico.
 *
 * `key={pathname}`: tras iniciar sesion la app navega sin recargar, asi que
 * se vuelve a montar en cada navegacion para leer la sesion nueva.
 */
export function SincronizadorDeReportes() {
  const hayEnCola = useHayReportesEnCola();
  const ruta = usePathname();
  return hayEnCola ? <ConSesion key={ruta} /> : null;
}

function ConSesion() {
  const sesion = useSesion();
  // Sin filtrar por rol: si alguien que no es ciudadano llego a encolar uno,
  // el backend responde 403 y el reporte queda "rechazado" con el motivo.
  const usuarioId = sesion.estado === 'autenticado' ? sesion.usuario.id : null;
  useSincronizacionAutomatica(usuarioId);
  return null;
}
