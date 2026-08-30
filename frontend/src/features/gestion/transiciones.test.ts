import { describe, expect, it } from 'vitest';
import { admiteResponsable, esTerminal, exigeComentario, transicionesDesde } from './transiciones';
import { ESTADOS_REPORTE } from '@/lib/types/domain';

/**
 * Estos tests documentan la maquina de estados tal como la ofrece la UI. Si
 * el backend cambia sus transiciones, aqui es donde debe notarse.
 */
describe('transicionesDesde', () => {
  it('desde PENDIENTE ofrece recibir o rechazar', () => {
    expect(transicionesDesde('PENDIENTE')).toEqual(['RECIBIDO', 'RECHAZADO']);
  });

  it('desde RECIBIDO ofrece procesar o rechazar', () => {
    expect(transicionesDesde('RECIBIDO')).toEqual(['EN_PROCESO', 'RECHAZADO']);
  });

  it('desde EN_PROCESO ofrece resolver o rechazar', () => {
    expect(transicionesDesde('EN_PROCESO')).toEqual(['RESUELTO', 'RECHAZADO']);
  });

  it('no ofrece nada desde los estados terminales', () => {
    expect(transicionesDesde('RESUELTO')).toEqual([]);
    expect(transicionesDesde('RECHAZADO')).toEqual([]);
    expect(transicionesDesde('CANCELADO')).toEqual([]);
  });

  it('nunca ofrece CANCELADO al funcionario', () => {
    // Cancelar es la retirada del ciudadano sobre su propio reporte (US-08).
    // El backend SI permitiría PENDIENTE -> CANCELADO en este endpoint, pero
    // la vía municipal para descartar es RECHAZADO, que exige comentario y
    // queda auditada como decisión de la municipalidad.
    for (const estado of ESTADOS_REPORTE) {
      expect(transicionesDesde(estado)).not.toContain('CANCELADO');
    }
  });

  it('nunca ofrece volver al estado actual', () => {
    for (const estado of ESTADOS_REPORTE) {
      expect(transicionesDesde(estado)).not.toContain(estado);
    }
  });

  it('nunca ofrece retroceder a PENDIENTE', () => {
    // El flujo es unidireccional: reabrir corrompería las métricas de
    // desempeño distrital (US-18/US-20).
    for (const estado of ESTADOS_REPORTE) {
      expect(transicionesDesde(estado)).not.toContain('PENDIENTE');
    }
  });

  it('devuelve vacío ante un estado desconocido, sin lanzar', () => {
    // `estado` llega como string del API.
    expect(transicionesDesde('ALGO_NUEVO')).toEqual([]);
    expect(() => transicionesDesde('')).not.toThrow();
  });
});

describe('esTerminal', () => {
  it('reconoce los tres estados sin salida', () => {
    expect(esTerminal('RESUELTO')).toBe(true);
    expect(esTerminal('RECHAZADO')).toBe(true);
    expect(esTerminal('CANCELADO')).toBe(true);
  });

  it('no marca como terminales los estados en curso', () => {
    expect(esTerminal('PENDIENTE')).toBe(false);
    expect(esTerminal('RECIBIDO')).toBe(false);
    expect(esTerminal('EN_PROCESO')).toBe(false);
  });
});

describe('exigeComentario', () => {
  it('solo lo exige al rechazar', () => {
    expect(exigeComentario('RECHAZADO')).toBe(true);
    expect(exigeComentario('RECIBIDO')).toBe(false);
    expect(exigeComentario('EN_PROCESO')).toBe(false);
    expect(exigeComentario('RESUELTO')).toBe(false);
  });
});

describe('admiteResponsable', () => {
  it('permite asignar mientras el reporte está en gestión', () => {
    expect(admiteResponsable('RECIBIDO')).toBe(true);
    expect(admiteResponsable('EN_PROCESO')).toBe(true);
  });

  it('no permite antes de recibirlo ni después de cerrarlo', () => {
    // Coincide con ESTADOS_ASIGNABLES del backend, que responde 409.
    expect(admiteResponsable('PENDIENTE')).toBe(false);
    expect(admiteResponsable('RESUELTO')).toBe(false);
    expect(admiteResponsable('RECHAZADO')).toBe(false);
    expect(admiteResponsable('CANCELADO')).toBe(false);
  });
});
