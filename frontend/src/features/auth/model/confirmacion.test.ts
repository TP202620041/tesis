import { describe, expect, it } from 'vitest';
import {
  ESPERA_REENVIO_SEGUNDOS,
  esCorreoRechazado,
  esCorreoSinConfirmar,
  estadoTrasErrorDeConfirmacion,
  permiteReenviar,
  segundosParaReenviar,
  textoDeHoras,
  TOKEN_CONFIRMACION_MAX,
  tokenDeConfirmacionUsable,
  type EstadoConfirmacion,
} from './confirmacion';

describe('estadoTrasErrorDeConfirmacion (NC-09)', () => {
  it.each([
    ['CORREO_YA_CONFIRMADO', 'confirmado'],
    ['CONFIRMACION_VENCIDA', 'vencido'],
    ['CONFIRMACION_REEMPLAZADA', 'reemplazado'],
    ['CONFIRMACION_INVALIDA', 'invalido'],
  ] as const)('409 %s → %s', (codigo, estado) => {
    expect(estadoTrasErrorDeConfirmacion(409, codigo)).toBe(estado);
  });

  it('el correo ya confirmado cuenta como éxito (segundo clic o antivirus que abrió el enlace)', () => {
    expect(estadoTrasErrorDeConfirmacion(409, 'CORREO_YA_CONFIRMADO')).toBe('confirmado');
  });

  it('un 400 (sin token o demasiado largo) es un enlace inválido', () => {
    expect(estadoTrasErrorDeConfirmacion(400, null)).toBe('invalido');
  });

  it('un 409 sin código o con uno desconocido, o un 5xx, es un error que se puede reintentar', () => {
    expect(estadoTrasErrorDeConfirmacion(409, null)).toBe('error');
    expect(estadoTrasErrorDeConfirmacion(409, 'OTRO')).toBe('error');
    expect(estadoTrasErrorDeConfirmacion(500, null)).toBe('error');
    expect(estadoTrasErrorDeConfirmacion(503, 'CONFIRMACION_VENCIDA')).toBe('error');
  });
});

describe('tokenDeConfirmacionUsable', () => {
  it('acepta un token como los reales (43 caracteres base64url)', () => {
    expect(tokenDeConfirmacionUsable('3q2-7w_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ')).toBe(true);
  });

  it('rechaza sin token, vacío o en blanco: no se llama al API', () => {
    expect(tokenDeConfirmacionUsable(null)).toBe(false);
    expect(tokenDeConfirmacionUsable(undefined)).toBe(false);
    expect(tokenDeConfirmacionUsable('')).toBe(false);
    expect(tokenDeConfirmacionUsable('   ')).toBe(false);
  });

  it('respeta el máximo del backend (100)', () => {
    expect(tokenDeConfirmacionUsable('a'.repeat(TOKEN_CONFIRMACION_MAX))).toBe(true);
    expect(tokenDeConfirmacionUsable('a'.repeat(TOKEN_CONFIRMACION_MAX + 1))).toBe(false);
  });
});

describe('permiteReenviar', () => {
  it('solo cuando el enlace no sirve', () => {
    const todos: EstadoConfirmacion[] = ['confirmando', 'confirmado', 'vencido', 'reemplazado', 'invalido', 'error'];
    expect(todos.filter(permiteReenviar)).toEqual(['vencido', 'reemplazado', 'invalido']);
  });
});

describe('códigos del registro y del login', () => {
  it('los 409 del dominio del correo van al campo', () => {
    expect(esCorreoRechazado(409, 'CORREO_DESECHABLE')).toBe(true);
    expect(esCorreoRechazado(409, 'DOMINIO_SIN_CORREO')).toBe(true);
  });

  it('el resto de los 409 del registro no (correo repetido, términos, captcha)', () => {
    expect(esCorreoRechazado(409, null)).toBe(false);
    expect(esCorreoRechazado(409, 'TERMINOS_PENDIENTES')).toBe(false);
    expect(esCorreoRechazado(400, 'CORREO_DESECHABLE')).toBe(false);
  });

  it('el 409 CORREO_NO_CONFIRMADO del login, y nada más', () => {
    expect(esCorreoSinConfirmar(409, 'CORREO_NO_CONFIRMADO')).toBe(true);
    expect(esCorreoSinConfirmar(401, 'CORREO_NO_CONFIRMADO')).toBe(false);
    expect(esCorreoSinConfirmar(409, null)).toBe(false);
  });
});

describe('segundosParaReenviar', () => {
  const T0 = 1_000_000;

  it('sin envío previo no hay espera', () => {
    expect(segundosParaReenviar(null, T0)).toBe(0);
  });

  it('cuenta hacia abajo desde 60 y redondea hacia arriba', () => {
    expect(ESPERA_REENVIO_SEGUNDOS).toBe(60);
    expect(segundosParaReenviar(T0, T0)).toBe(60);
    expect(segundosParaReenviar(T0, T0 + 1)).toBe(60);
    expect(segundosParaReenviar(T0, T0 + 59_001)).toBe(1);
  });

  it('a los 60 s ya se puede volver a pedir', () => {
    expect(segundosParaReenviar(T0, T0 + 60_000)).toBe(0);
    expect(segundosParaReenviar(T0, T0 + 600_000)).toBe(0);
  });
});

describe('textoDeHoras', () => {
  it('singular y plural', () => {
    expect(textoDeHoras(24)).toBe('24 horas');
    expect(textoDeHoras(1)).toBe('1 hora');
  });
});
