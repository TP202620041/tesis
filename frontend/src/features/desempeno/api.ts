import { api } from '@/lib/api/client';
import type { DashboardDistrito } from './model/dashboard';
import type { DashboardGestion, PeriodoGestion } from './model/gestion';

/**
 * NC-06: periodos de gestión municipal, el más reciente primero, con
 * `vigente` (el que contiene hoy en hora de Lima).
 *
 * PÚBLICO — sin token (`conAuth: false`): el indicador OE3-I5 pide que el
 * dashboard se consulte sin iniciar sesión.
 */
export function listarPeriodosDeGestion(): Promise<PeriodoGestion[]> {
  return api.get<PeriodoGestion[]>('/api/desempeno/periodos', { conAuth: false });
}

/**
 * NC-06: tasa de resolución, tiempo promedio de atención (en días),
 * satisfacción y conteos de cada municipalidad en un periodo de gestión.
 *
 * PÚBLICO, sin token. Se envía siempre `periodoId`: sin él el backend usa el
 * vigente y responde 404 si hoy no cae en ninguno. Sin `categoriaId` trae los
 * 43 distritos (con métricas en `null` los que no tienen reportes); con
 * `categoriaId` solo los que tienen reportes válidos de ese tipo en el
 * periodo — la lista se acorta, no es un error.
 *
 * Reemplaza en la PWA a `GET /api/desempeno/distritos` (índice de US-18/US-20
 * con todos los periodos juntos y el tiempo en horas), que el backend
 * mantiene sin cambios.
 */
export function dashboardDeGestion(periodoId: number, categoriaId?: number | null): Promise<DashboardGestion> {
  const params = new URLSearchParams({ periodoId: String(periodoId) });
  if (categoriaId != null) params.set('categoriaId', String(categoriaId));
  return api.get<DashboardGestion>(`/api/desempeno/gestion?${params.toString()}`, { conAuth: false });
}

/**
 * US-17: dashboard interno del distrito del funcionario autenticado.
 *
 * CON token: a diferencia del índice público, trae señales operativas
 * internas (sin responsable, estancados). El distrito lo decide el backend a
 * partir del token, no un parámetro: el funcionario no puede pedir el de otro.
 */
export function dashboardMiDistrito(): Promise<DashboardDistrito> {
  return api.get<DashboardDistrito>('/api/desempeno/mi-distrito');
}
