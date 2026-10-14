import { describe, expect, it } from 'vitest';
import { finDelDiaLocal, inicioDelDiaLocal } from '@/lib/types/fechas';
import {
  construirQuery,
  esBboxValido,
  hayFiltrosActivos,
  requiereNuevaConsulta,
  validarFiltrosMapa,
  FILTROS_VACIOS,
  MENSAJE_RANGO_INVERTIDO,
  type BoundingBox,
} from './bbox';

const AREA: BoundingBox = {
  minLat: -12.13,
  minLon: -77.04,
  maxLat: -12.11,
  maxLon: -77.02,
};

describe('esBboxValido', () => {
  it('acepta un área bien formada', () => {
    expect(esBboxValido(AREA)).toBe(true);
  });

  it('rechaza null', () => {
    expect(esBboxValido(null)).toBe(false);
  });

  it('rechaza un área degenerada (sin alto o sin ancho)', () => {
    // Ocurre de verdad: un contenedor con altura 0 da bounds colapsados, y
    // el backend devolvería siempre vacío sin explicación aparente.
    expect(esBboxValido({ ...AREA, maxLat: AREA.minLat })).toBe(false);
    expect(esBboxValido({ ...AREA, maxLon: AREA.minLon })).toBe(false);
  });

  it('rechaza coordenadas no finitas', () => {
    expect(esBboxValido({ ...AREA, minLat: Number.NaN })).toBe(false);
    expect(esBboxValido({ ...AREA, maxLon: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('requiereNuevaConsulta', () => {
  it('consulta siempre la primera vez', () => {
    expect(requiereNuevaConsulta(null, AREA)).toBe(true);
  });

  it('no consulta si el mapa apenas se movió', () => {
    // ~11 m: el usuario ajustó el encuadre, ve los mismos reportes.
    const casiIgual = { ...AREA, minLat: AREA.minLat + 0.0001 };
    expect(requiereNuevaConsulta(AREA, casiIgual)).toBe(false);
  });

  it('consulta si el desplazamiento supera el umbral', () => {
    const movido = { ...AREA, minLat: AREA.minLat + 0.01 };
    expect(requiereNuevaConsulta(AREA, movido)).toBe(true);
  });

  it('detecta el cambio en cualquiera de las cuatro coordenadas', () => {
    // Un zoom mueve maxLat/maxLon aunque el centro no cambie: si solo se
    // compararan las mínimas, un zoom no recargaría.
    expect(requiereNuevaConsulta(AREA, { ...AREA, maxLat: AREA.maxLat + 0.01 })).toBe(true);
    expect(requiereNuevaConsulta(AREA, { ...AREA, maxLon: AREA.maxLon + 0.01 })).toBe(true);
    expect(requiereNuevaConsulta(AREA, { ...AREA, minLon: AREA.minLon - 0.01 })).toBe(true);
  });
});

describe('construirQuery', () => {
  it('incluye siempre las cuatro coordenadas y el tamaño', () => {
    const query = new URLSearchParams(construirQuery(AREA, FILTROS_VACIOS, 300));
    expect(query.get('minLat')).toBe('-12.13');
    expect(query.get('minLon')).toBe('-77.04');
    expect(query.get('maxLat')).toBe('-12.11');
    expect(query.get('maxLon')).toBe('-77.02');
    expect(query.get('size')).toBe('300');
  });

  it('omite los filtros no aplicados en vez de enviarlos vacíos', () => {
    // Mandar `estado=` haría fallar la conversión al enum en el backend.
    const query = construirQuery(AREA, FILTROS_VACIOS, 300);
    expect(query).not.toContain('estado');
    expect(query).not.toContain('distritoId');
    expect(query).not.toContain('categoriaId');
  });

  it('incluye los filtros aplicados', () => {
    const query = new URLSearchParams(
      construirQuery(
        AREA,
        { ...FILTROS_VACIOS, distritoId: 21, categoriaId: 3, estado: 'RESUELTO' },
        300,
      ),
    );
    expect(query.get('distritoId')).toBe('21');
    expect(query.get('categoriaId')).toBe('3');
    expect(query.get('estado')).toBe('RESUELTO');
  });

  it('trata el id 0 como filtro aplicado y no como ausente', () => {
    // Guard contra usar `if (filtros.distritoId)`: un id 0 es falsy y se
    // perdería silenciosamente.
    const query = new URLSearchParams(
      construirQuery(AREA, { ...FILTROS_VACIOS, distritoId: 0 }, 300),
    );
    expect(query.get('distritoId')).toBe('0');
  });

  it('envía las fechas como instantes con semántica de día local (US-12)', () => {
    const query = new URLSearchParams(
      construirQuery(
        AREA,
        { ...FILTROS_VACIOS, fechaDesde: '2026-10-01', fechaHasta: '2026-10-05' },
        300,
      ),
    );
    expect(query.get('fechaDesde')).toBe(inicioDelDiaLocal('2026-10-01'));
    expect(query.get('fechaHasta')).toBe(finDelDiaLocal('2026-10-05'));
  });

  it('acepta un solo extremo del rango', () => {
    const query = new URLSearchParams(
      construirQuery(AREA, { ...FILTROS_VACIOS, fechaHasta: '2026-10-05' }, 300),
    );
    expect(query.has('fechaDesde')).toBe(false);
    expect(query.get('fechaHasta')).toBe(finDelDiaLocal('2026-10-05'));
  });

  it('omite las fechas no aplicadas o mal formadas', () => {
    expect(construirQuery(AREA, FILTROS_VACIOS, 300)).not.toContain('fecha');
    expect(
      construirQuery(AREA, { ...FILTROS_VACIOS, fechaDesde: '2026-02-31' }, 300),
    ).not.toContain('fecha');
  });
});

describe('validarFiltrosMapa', () => {
  it('rechaza el rango invertido con un mensaje', () => {
    expect(
      validarFiltrosMapa({ ...FILTROS_VACIOS, fechaDesde: '2026-10-06', fechaHasta: '2026-10-05' }),
    ).toBe(MENSAJE_RANGO_INVERTIDO);
  });

  it('acepta el mismo día, un solo extremo o ninguno', () => {
    expect(
      validarFiltrosMapa({ ...FILTROS_VACIOS, fechaDesde: '2026-10-05', fechaHasta: '2026-10-05' }),
    ).toBeNull();
    expect(validarFiltrosMapa({ ...FILTROS_VACIOS, fechaDesde: '2026-10-05' })).toBeNull();
    expect(validarFiltrosMapa(FILTROS_VACIOS)).toBeNull();
  });
});

describe('hayFiltrosActivos', () => {
  it('es falso solo con los filtros vacíos', () => {
    expect(hayFiltrosActivos(FILTROS_VACIOS)).toBe(false);
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS })).toBe(false);
  });

  it('cuenta cada filtro, también las fechas y el id 0', () => {
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, fechaDesde: '2026-10-01' })).toBe(true);
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, fechaHasta: '2026-10-01' })).toBe(true);
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, estado: 'PENDIENTE' })).toBe(true);
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, distritoId: 0 })).toBe(true);
  });
});
