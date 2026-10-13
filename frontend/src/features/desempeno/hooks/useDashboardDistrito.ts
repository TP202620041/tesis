'use client';

import { useCarga } from '@/lib/hooks/useCarga';
import { dashboardMiDistrito } from '../api';
import type { DashboardDistrito } from '../model/dashboard';

/** US-17: métricas del distrito del funcionario autenticado. */
export function useDashboardDistrito() {
  return useCarga<DashboardDistrito>(() => dashboardMiDistrito(), []);
}
