import { describe, expect, it } from 'vitest';
import { ANCLA_REPORTES_QUE_APOYAS, RUTA_REPORTES_QUE_APOYAS, enlaceDeReporteApoyado } from './apoyos';

describe('enlaceDeReporteApoyado (QA-1 M-6)', () => {
  it.each(['PENDIENTE', 'RECIBIDO', 'EN_PROCESO', 'RESUELTO', 'RECHAZADO'])(
    '%s lleva al detalle público, nunca al del creador',
    (estado) => {
      expect(enlaceDeReporteApoyado({ id: 184, estado })).toBe('/reportes/184');
    },
  );

  it('un CANCELADO no tiene enlace: su detalle público da 404', () => {
    expect(enlaceDeReporteApoyado({ id: 184, estado: 'CANCELADO' })).toBeNull();
  });

  it('sin id no hay a dónde enlazar', () => {
    expect(enlaceDeReporteApoyado({ estado: 'PENDIENTE' })).toBeNull();
  });
});

describe('RUTA_REPORTES_QUE_APOYAS', () => {
  it('apunta a la sección dentro de «Mis reportes»', () => {
    expect(RUTA_REPORTES_QUE_APOYAS).toBe(`/mis-reportes#${ANCLA_REPORTES_QUE_APOYAS}`);
  });
});
