import { describe, expect, it } from 'vitest';
import {
  esTerminal,
  explicacionDeEstado,
  puedeCalificar,
  puedeCancelar,
  puedeEditar,
} from './acciones';
import { ESTADOS_REPORTE } from '@/lib/types/domain';

describe('puedeEditar / puedeCancelar', () => {
  it('solo mientras el reporte sigue PENDIENTE', () => {
    expect(puedeEditar('PENDIENTE')).toBe(true);
    expect(puedeCancelar('PENDIENTE')).toBe(true);
  });

  it('no una vez que la municipalidad lo recibió', () => {
    // US-08: a partir de RECIBIDO hay trabajo municipal comprometido y el
    // ciudadano ya no puede retirarlo unilateralmente.
    for (const estado of ESTADOS_REPORTE.filter((e) => e !== 'PENDIENTE')) {
      expect(puedeEditar(estado)).toBe(false);
      expect(puedeCancelar(estado)).toBe(false);
    }
  });
});

describe('puedeCalificar', () => {
  it('solo cuando está RESUELTO', () => {
    // Antes de resolverlo no hay atención que evaluar (US-26 -> 409).
    expect(puedeCalificar('RESUELTO')).toBe(true);
    for (const estado of ESTADOS_REPORTE.filter((e) => e !== 'RESUELTO')) {
      expect(puedeCalificar(estado)).toBe(false);
    }
  });

  it('no se puede calificar un reporte rechazado ni cancelado', () => {
    // Aunque ambos sean terminales, no hubo reparación que evaluar.
    expect(puedeCalificar('RECHAZADO')).toBe(false);
    expect(puedeCalificar('CANCELADO')).toBe(false);
  });
});

describe('esTerminal', () => {
  it('reconoce los estados sin cambios posibles', () => {
    expect(esTerminal('RESUELTO')).toBe(true);
    expect(esTerminal('RECHAZADO')).toBe(true);
    expect(esTerminal('CANCELADO')).toBe(true);
    expect(esTerminal('PENDIENTE')).toBe(false);
    expect(esTerminal('RECIBIDO')).toBe(false);
    expect(esTerminal('EN_PROCESO')).toBe(false);
  });
});

describe('explicacionDeEstado', () => {
  it('explica todos los estados del backend', () => {
    // Un estado nuevo sin texto dejaría al vecino sin saber qué pasa con su
    // reporte, que es justo lo que esta pantalla resuelve.
    for (const estado of ESTADOS_REPORTE) {
      const texto = explicacionDeEstado(estado);
      expect(texto).not.toBe('Estado no reconocido.');
      expect(texto.length).toBeGreaterThan(20);
    }
  });

  it('degrada sin romper ante un estado desconocido', () => {
    expect(explicacionDeEstado('ALGO_NUEVO')).toBe('Estado no reconocido.');
  });

  it('menciona las acciones disponibles en los estados que las tienen', () => {
    expect(explicacionDeEstado('PENDIENTE')).toMatch(/editarlo|retirarlo/);
    expect(explicacionDeEstado('RESUELTO')).toMatch(/calificar/i);
  });
});
