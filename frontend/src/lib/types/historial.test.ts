import { describe, expect, it } from 'vitest';
import type { HistorialEntrada } from './domain';
import { conEventoDeCreacion, esEventoDeCreacion } from './historial';

const CREADO = '2026-10-29T15:10:00Z';
const cambio: HistorialEntrada = {
  id: 5,
  tipoEvento: 'CAMBIO_ESTADO',
  estadoAnterior: 'PENDIENTE',
  estadoNuevo: 'RECIBIDO',
  fecha: '2026-10-30T10:00:00Z',
};

describe('conEventoDeCreacion (US-22 Esc. 2)', () => {
  it('sin cambios de estado, el historial tiene solo el evento de creación', () => {
    expect(conEventoDeCreacion([], CREADO)).toEqual([{ tipoEvento: 'CREACION', fecha: CREADO }]);
  });

  it('la creación va primero, antes de los eventos del servidor', () => {
    const resultado = conEventoDeCreacion([cambio], CREADO);
    expect(resultado.map((e) => e.tipoEvento)).toEqual(['CREACION', 'CAMBIO_ESTADO']);
  });

  it('si el servidor ya trae el evento de creación, no se duplica', () => {
    // Forma del contrato (handoff 2026-11-23): id, estadoAnterior y autor nulos.
    const delServidor: HistorialEntrada = {
      id: null,
      tipoEvento: 'CREACION',
      estadoAnterior: null,
      estadoNuevo: 'PENDIENTE',
      comentario: 'Se registró el reporte.',
      autor: null,
      fecha: CREADO,
      avisoIndice: null,
    };
    expect(conEventoDeCreacion([delServidor, cambio], CREADO)).toEqual([delServidor, cambio]);
    // Aunque la fecha del reporte no coincida al segundo, no se deriva otra.
    expect(conEventoDeCreacion([delServidor], '2026-10-29T15:10:01Z')).toHaveLength(1);
  });

  it('sin fecha de creación válida no inventa nada', () => {
    expect(conEventoDeCreacion([cambio], null)).toEqual([cambio]);
    expect(conEventoDeCreacion([], undefined)).toEqual([]);
    expect(conEventoDeCreacion([], 'no es fecha')).toEqual([]);
  });

  it('no modifica el arreglo recibido', () => {
    const entradas = [cambio];
    conEventoDeCreacion(entradas, CREADO);
    expect(entradas).toEqual([cambio]);
  });

  it('reconoce el evento de creación por su tipo', () => {
    expect(esEventoDeCreacion({ tipoEvento: 'CREACION' })).toBe(true);
    expect(esEventoDeCreacion(cambio)).toBe(false);
    expect(esEventoDeCreacion({})).toBe(false);
  });
});
