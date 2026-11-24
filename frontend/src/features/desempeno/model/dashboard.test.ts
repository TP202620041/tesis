import { describe, expect, it } from 'vitest';
import {
  datosInsuficientes,
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

describe('datos insuficientes (US-17 Esc. 2)', () => {
  const con = (totalReportes: number): DesempenoDistrital => ({ ...CON_DATOS, totalReportes });

  it('menos de 5 reportes son insuficientes; 5 ya no', () => {
    expect(datosInsuficientes(con(0))).toBe(true);
    expect(datosInsuficientes(con(4))).toBe(true);
    expect(datosInsuficientes(con(5))).toBe(false);
  });

  it('un total null no es «menos de 5»: sin aviso, y la métrica null dice «Sin datos»', () => {
    // springdoc lo tipa `number | undefined`; el API enviaría `null`. Ninguno es 0.
    const sinTotal: DesempenoDistrital = {
      ...CON_DATOS,
      totalReportes: null as unknown as number,
      tasaResolucion: null,
    };
    expect(datosInsuficientes(sinTotal)).toBe(false);
    expect(datosInsuficientes({ ...CON_DATOS, totalReportes: undefined })).toBe(false);
    expect(valores(indicadoresDeDesempeno(sinTotal))).toMatchObject({
      total: 'Sin datos',
      tasa: 'Sin datos',
    });
  });

  it('con datos insuficientes, tasa, tiempo y satisfacción no se muestran; los conteos sí', () => {
    expect(valores(indicadoresDeDesempeno({ ...CON_DATOS, totalReportes: 4, totalResueltos: 2 }))).toMatchObject({
      total: '4',
      resueltos: '2',
      tasa: 'Datos insuficientes',
      tiempo: 'Datos insuficientes',
      satisfaccion: 'Datos insuficientes',
    });
  });

  it('una métrica null sigue siendo «Sin datos» aunque los datos sean insuficientes', () => {
    expect(valores(indicadoresDeDesempeno(SIN_REPORTES)).tasa).toBe('Sin datos');
  });
});

