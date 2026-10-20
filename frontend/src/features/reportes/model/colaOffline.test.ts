import { describe, expect, it } from 'vitest';
import { desenlaceDeEnvio, pendientesDe, type ReporteEnCola } from './colaOffline';

function enCola(clave: string, usuarioId: number, creadoEn: string): ReporteEnCola {
  return {
    idempotencyKey: clave,
    usuarioId,
    creadoEn,
    datos: { latitud: -12.1, longitud: -77.0, categoriaId: 1, ubicacionManual: false },
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
