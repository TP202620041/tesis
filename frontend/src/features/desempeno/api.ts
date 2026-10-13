import { api } from '@/lib/api/client';
import type { DashboardDistrito } from './model/dashboard';
import type { DesempenoDistrital } from './model/formato';

/**
 * US-18/US-20: indice publico de desempeno distrital.
 *
 * PUBLICO — sin token (`conAuth: false`): es informacion de transparencia
 * ciudadana y cualquiera debe poder consultarla.
 *
 * Sin `categoriaId` devuelve el agregado general: **los 43 distritos**,
 * incluidos los que no tienen reportes (con metricas en `null`). Con
 * `categoriaId` devuelve el desglose de esa categoria y **solo aparecen los
 * distritos que tienen reportes de ese tipo** — la lista se acorta, no es un
 * error.
 */
export function rankingDistrital(categoriaId?: number | null): Promise<DesempenoDistrital[]> {
  const query = categoriaId != null ? `?categoriaId=${categoriaId}` : '';
  return api.get<DesempenoDistrital[]>(`/api/desempeno/distritos${query}`, { conAuth: false });
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
