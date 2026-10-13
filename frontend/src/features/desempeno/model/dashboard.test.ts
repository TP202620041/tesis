import { describe, expect, it } from 'vitest';
import {
  formatearActualizacion,
  indicadoresDeDesempeno,
  indicadoresOperativos,
  type DashboardDistrito,
} from './dashboard';
import type { DesempenoDistrital } from './formato';

const CON_DATOS: DesempenoDistrital = {
  distritoId: 21,
  distritoNombre: 'Miraflores',
  categoriaId: null,
  totalReportes: 1234,
  totalResueltos: 40,
  tasaResolucion: 35.5,
  tiempoPromedioHoras: 36,
  satisfaccionPromedio: 4.25,
  totalCalificaciones: 12,
  calculatedAt: '2026-10-13T15:00:00Z',
};

/** Distrito sin reportes: la vista deja las métricas en NULL. */
const SIN_REPORTES: DesempenoDistrital = {
  ...CON_DATOS,
  totalReportes: 0,
  totalResueltos: 0,
  tasaResolucion: null,
  tiempoPromedioHoras: null,
  satisfaccionPromedio: null,
  totalCalificaciones: 0,
};

const valores = (indicadores: { id: string; valor: string }[]) =>
  Object.fromEntries(indicadores.map((i) => [i.id, i.valor]));

describe('indicadoresDeDesempeno', () => {
  it('formatea las métricas del índice con el formato es-PE', () => {
    expect(valores(indicadoresDeDesempeno(CON_DATOS))).toEqual({
      total: '1,234',
      resueltos: '40',
      tasa: '35.5 %',
      tiempo: '1 d 12 h',
      satisfaccion: '4.3 / 5',
    });
  });

  it('null se muestra "Sin datos", nunca 0', () => {
    const v = valores(indicadoresDeDesempeno(SIN_REPORTES));
    expect(v.tasa).toBe('Sin datos');
    expect(v.tiempo).toBe('Sin datos');
    expect(v.satisfaccion).toBe('Sin datos');
    // Los conteos sí son ceros reales (long en el backend).
    expect(v.total).toBe('0');
    expect(v.resueltos).toBe('0');
  });

  it('describe cuántas calificaciones respaldan la satisfacción, en singular o plural', () => {
    const una = indicadoresDeDesempeno({ ...CON_DATOS, totalCalificaciones: 1 });
    expect(una.find((i) => i.id === 'satisfaccion')?.descripcion).toBe(
      'Promedio de 1 calificación de los vecinos.',
    );
    const varias = indicadoresDeDesempeno(CON_DATOS);
    expect(varias.find((i) => i.id === 'satisfaccion')?.descripcion).toBe(
      'Promedio de 12 calificaciones de los vecinos.',
    );
  });
});

describe('indicadoresOperativos', () => {
  it('muestra los dos conteos internos, con el 0 como cero real', () => {
    const dashboard: DashboardDistrito = {
      resumen: CON_DATOS,
      reportesSinResponsable: 0,
      reportesEstancados: 3,
    };
    expect(valores(indicadoresOperativos(dashboard))).toEqual({
      'sin-responsable': '0',
      estancados: '3',
    });
  });
});

describe('formatearActualizacion', () => {
  it('devuelve null si no hay fecha o es inválida', () => {
    expect(formatearActualizacion(null)).toBeNull();
    expect(formatearActualizacion(undefined)).toBeNull();
    expect(formatearActualizacion('no-es-fecha')).toBeNull();
  });

  it('formatea una fecha válida', () => {
    expect(formatearActualizacion('2026-10-13T15:00:00Z')).toMatch(/2026/);
  });
});
