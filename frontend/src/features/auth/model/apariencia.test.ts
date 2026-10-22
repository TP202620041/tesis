import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APARIENCIAS,
  aparienciaGuardada,
  CLAVE_APARIENCIA,
  OPCIONES_DE_APARIENCIA,
  temaDe,
  type Apariencia,
} from './apariencia';

const SISTEMA_CLARO = { oscuro: false, masContraste: false };

describe('temaDe (US-23)', () => {
  it('una elección explícita manda sobre el sistema', () => {
    expect(temaDe('claro', { oscuro: true, masContraste: true })).toBe('claro');
    expect(temaDe('oscuro', SISTEMA_CLARO)).toBe('oscuro');
    expect(temaDe('alto-contraste', SISTEMA_CLARO)).toBe('alto-contraste');
  });

  it('«Sistema» sigue al dispositivo; el pedido de más contraste va primero', () => {
    expect(temaDe('sistema', SISTEMA_CLARO)).toBe('claro');
    expect(temaDe('sistema', { oscuro: true, masContraste: false })).toBe('oscuro');
    expect(temaDe('sistema', { oscuro: true, masContraste: true })).toBe('alto-contraste');
  });

  it('lo guardado que no se reconoce cuenta como «Sistema»', () => {
    expect(aparienciaGuardada(null)).toBe('sistema');
    expect(aparienciaGuardada('rosado')).toBe('sistema');
    expect(aparienciaGuardada('oscuro')).toBe('oscuro');
  });

  it('ofrece las cuatro opciones, con Sistema primero', () => {
    expect(OPCIONES_DE_APARIENCIA.map((o) => o.etiqueta)).toEqual(['Sistema', 'Claro', 'Oscuro', 'Alto contraste']);
  });
});

/*
 * `public/tema.js` corre antes que React y repite estas reglas a mano. Se
 * ejecuta aquí, tal cual se sirve, con cada combinación de lo guardado y del
 * sistema, y debe dar el mismo tema que `temaDe`.
 */
describe('public/tema.js resuelve igual que el modelo', () => {
  const codigo = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'public', 'tema.js'), 'utf8');

  function ejecutar(guardado: string | null, sistema: { oscuro: boolean; masContraste: boolean }) {
    window.localStorage.clear();
    if (guardado !== null) window.localStorage.setItem(CLAVE_APARIENCIA, guardado);
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches:
        (consulta === '(prefers-color-scheme: dark)' && sistema.oscuro) ||
        (consulta === '(prefers-contrast: more)' && sistema.masContraste),
    }));
    document.documentElement.removeAttribute('data-theme');
    new Function(codigo)();
    return document.documentElement.getAttribute('data-theme');
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  const sistemas = [
    { oscuro: false, masContraste: false },
    { oscuro: true, masContraste: false },
    { oscuro: false, masContraste: true },
    { oscuro: true, masContraste: true },
  ];

  for (const guardado of [...APARIENCIAS, null, 'desconocido']) {
    for (const sistema of sistemas) {
      it(`guardado ${String(guardado)}, sistema ${JSON.stringify(sistema)}`, () => {
        const esperado = temaDe(aparienciaGuardada(guardado as Apariencia | null), sistema);
        expect(ejecutar(guardado, sistema)).toBe(esperado);
      });
    }
  }

  it('usa la misma clave de localStorage que el modelo', () => {
    expect(codigo).toContain(`'${CLAVE_APARIENCIA}'`);
  });

  it('si localStorage lanza, sigue al sistema en vez de romper', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    try {
      expect(ejecutar(null, { oscuro: true, masContraste: false })).toBe('oscuro');
    } finally {
      vi.restoreAllMocks();
    }
  });
});
