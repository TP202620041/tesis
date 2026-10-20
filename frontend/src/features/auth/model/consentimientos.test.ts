import { describe, expect, it } from 'vitest';
import {
  desdeRespuestaDeConsentimientos,
  estadoDeConsentimiento,
  etiquetaDeFinalidad,
  tieneVigente,
  versionDeAviso,
  vigenteDe,
  VERSION_AVISO_CORREO,
  VERSION_AVISO_PUSH,
} from './consentimientos';
import { FINALIDADES_CONSENTIMIENTO } from '@/lib/types/domain';

/** Ejemplo del handoff `2026-10-19-consentimiento.md`. */
const RESPUESTA = {
  versionTerminosVigente: '2026-10-v1',
  debeAceptarTerminos: false,
  vigentes: [
    {
      id: 12,
      finalidad: 'TERMINOS_Y_PRIVACIDAD',
      versionDocumento: '2026-10-v1',
      aceptadoEn: '2026-10-19T15:02:11.481Z',
      revocadoEn: undefined,
      vigente: true,
    },
  ],
  historial: [
    {
      id: 14,
      finalidad: 'NOTIFICACIONES_PUSH',
      versionDocumento: 'push-2026-10-v1',
      aceptadoEn: '2026-10-19T15:05:40.010Z',
      revocadoEn: '2026-10-19T15:09:02.334Z',
      vigente: false,
    },
    {
      id: 12,
      finalidad: 'TERMINOS_Y_PRIVACIDAD',
      versionDocumento: '2026-10-v1',
      aceptadoEn: '2026-10-19T15:02:11.481Z',
      vigente: true,
    },
    { id: 99, finalidad: 'FINALIDAD_FUTURA', versionDocumento: 'x', vigente: true },
  ],
};

describe('desdeRespuestaDeConsentimientos', () => {
  it('normaliza la respuesta: revocadoEn ausente es null y descarta finalidades desconocidas', () => {
    const c = desdeRespuestaDeConsentimientos(RESPUESTA);
    expect(c.versionTerminosVigente).toBe('2026-10-v1');
    expect(c.debeAceptarTerminos).toBe(false);
    expect(c.vigentes).toHaveLength(1);
    expect(c.vigentes[0]?.revocadoEn).toBeNull();
    expect(c.historial.map((h) => h.id)).toEqual([14, 12]);
  });

  it('sin listas devuelve listas vacías, no undefined', () => {
    const c = desdeRespuestaDeConsentimientos({ versionTerminosVigente: 'v', debeAceptarTerminos: true });
    expect(c).toEqual({ versionTerminosVigente: 'v', debeAceptarTerminos: true, vigentes: [], historial: [] });
  });
});

describe('vigenteDe / tieneVigente', () => {
  const c = desdeRespuestaDeConsentimientos(RESPUESTA);

  it('encuentra el vigente de una finalidad', () => {
    expect(vigenteDe(c, 'TERMINOS_Y_PRIVACIDAD')?.id).toBe(12);
    expect(tieneVigente(c, 'TERMINOS_Y_PRIVACIDAD')).toBe(true);
  });

  it('un consentimiento revocado (solo en el historial) no autoriza', () => {
    expect(tieneVigente(c, 'NOTIFICACIONES_PUSH')).toBe(false);
    expect(vigenteDe(c, 'NOTIFICACIONES_CORREO')).toBeNull();
  });
});

describe('textos y versiones', () => {
  it('cada aviso opcional tiene su versión propia', () => {
    expect(versionDeAviso('NOTIFICACIONES_PUSH')).toBe(VERSION_AVISO_PUSH);
    expect(versionDeAviso('NOTIFICACIONES_CORREO')).toBe(VERSION_AVISO_CORREO);
    // El backend la guarda con un tope de 40 caracteres.
    expect(VERSION_AVISO_PUSH.length).toBeLessThanOrEqual(40);
    expect(VERSION_AVISO_CORREO.length).toBeLessThanOrEqual(40);
  });

  it('toda finalidad tiene etiqueta', () => {
    for (const f of FINALIDADES_CONSENTIMIENTO) expect(etiquetaDeFinalidad(f)).not.toBe('');
  });

  it('estadoDeConsentimiento distingue vigente, revocado y versión anterior', () => {
    const base = {
      id: 1,
      finalidad: 'TERMINOS_Y_PRIVACIDAD' as const,
      versionDocumento: 'v',
      aceptadoEn: '2026-10-01T00:00:00Z',
    };
    expect(estadoDeConsentimiento({ ...base, revocadoEn: null, vigente: true })).toBe('Vigente');
    expect(estadoDeConsentimiento({ ...base, revocadoEn: '2026-10-02T00:00:00Z', vigente: false })).toBe(
      'Revocado',
    );
    expect(estadoDeConsentimiento({ ...base, revocadoEn: null, vigente: false })).toBe('Versión anterior');
  });
});
