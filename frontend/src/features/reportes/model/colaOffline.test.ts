import { describe, expect, it } from 'vitest';
import {
  debePurgarse,
  desenlaceDeEnvio,
  estadoVisible,
  estaIncompleto,
  pendientesDe,
  seReenviaSolo,
  type ReporteEnCola,
} from './colaOffline';

function enCola(clave: string, usuarioId: number, creadoEn: string): ReporteEnCola {
  return {
    idempotencyKey: clave,
    usuarioId,
    creadoEn,
    datos: {
      latitud: -12.1,
      longitud: -77.0,
      categoriaId: 1,
      titulo: 'Bache en Miraflores',
      severidad: 'MEDIA',
      ubicacionManual: false,
    },
    foto: null,
    estado: 'pendiente',
    motivo: null,
  };
}

describe('desenlaceDeEnvio', () => {
  it('2xx es enviado (incluida la respuesta original de una clave repetida)', () => {
    expect(desenlaceDeEnvio(201)).toBe('enviado');
    expect(desenlaceDeEnvio(200)).toBe('enviado');
  });

  it('sin respuesta o 5xx: sin conexion, se reintenta luego', () => {
    expect(desenlaceDeEnvio(null)).toBe('sin-conexion');
    expect(desenlaceDeEnvio(503)).toBe('sin-conexion');
  });

  it('401 conserva el reporte hasta volver a iniciar sesion', () => {
    expect(desenlaceDeEnvio(401)).toBe('sin-sesion');
  });

  it('403 por términos pendientes conserva el reporte (NC-07b)', () => {
    expect(desenlaceDeEnvio(403, { terminosPendientes: true })).toBe('sin-sesion');
  });

  it('otro 4xx es un rechazo de negocio', () => {
    expect(desenlaceDeEnvio(400)).toBe('rechazado');
    expect(desenlaceDeEnvio(403)).toBe('rechazado');
    expect(desenlaceDeEnvio(409)).toBe('rechazado');
  });
});

describe('pendientesDe', () => {
  it('solo los del usuario, del mas antiguo al mas nuevo', () => {
    const cola = [
      enCola('b', 1, '2026-10-19T10:05:00.000Z'),
      enCola('x', 2, '2026-10-19T09:00:00.000Z'),
      enCola('a', 1, '2026-10-19T10:00:00.000Z'),
    ];

    expect(pendientesDe(cola, 1).map((r) => r.idempotencyKey)).toEqual(['a', 'b']);
    expect(pendientesDe(cola, 3)).toEqual([]);
  });
});

describe('estado «incompleto» (NC-02)', () => {
  const CREADO = '2026-10-19T10:00:00.000Z';
  const HORA = 60 * 60 * 1000;
  const tras = (horas: number) => new Date(new Date(CREADO).getTime() + horas * HORA);
  /** Como lo guardaba la version anterior: sin titulo ni severidad. */
  function viejo(extra: Partial<ReporteEnCola> = {}): ReporteEnCola {
    const datos = { ...enCola('v', 1, CREADO).datos };
    delete datos.titulo;
    delete datos.severidad;
    return { ...enCola('v', 1, CREADO), datos, ...extra };
  }

  it('se deduce de que falten (o no sean validos) el titulo o la severidad', () => {
    expect(estaIncompleto(enCola('k', 1, CREADO))).toBe(false);
    expect(estaIncompleto(viejo())).toBe(true);
    const base = enCola('k', 1, CREADO);
    expect(estaIncompleto({ ...base, datos: { ...base.datos, titulo: 'Hoyo' } })).toBe(true);
    expect(estaIncompleto({ ...base, datos: { ...base.datos, severidad: undefined } })).toBe(true);
  });

  it('no se reenvia solo', () => {
    expect(estadoVisible(viejo(), tras(1))).toBe('incompleto');
    expect(seReenviaSolo(viejo(), tras(1))).toBe(false);
  });

  it('prevalece sobre rechazado y caducado: completarlo es la salida', () => {
    expect(estadoVisible(viejo({ estado: 'rechazado', motivo: 'El titulo…' }), tras(1))).toBe(
      'incompleto',
    );
    expect(estadoVisible(viejo(), tras(72))).toBe('incompleto');
  });

  it('nunca se purga, aunque pasen 30 dias', () => {
    expect(debePurgarse(viejo(), tras(40 * 24))).toBe(false);
    expect(debePurgarse(viejo({ estado: 'rechazado', motivo: 'x' }), tras(40 * 24))).toBe(false);
    // Un completo caducado de la misma edad si.
    expect(debePurgarse(enCola('k', 1, CREADO), tras(40 * 24))).toBe(true);
  });
});
