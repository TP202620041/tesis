import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError, mensajeDeError } from './errors';

describe('mensajeDeError', () => {
  it('sin conexión no muestra un mensaje del backend, porque no hubo respuesta', () => {
    expect(mensajeDeError(new NetworkError())).toEqual({
      mensaje: 'Sin conexión con el servidor. Revisa tu red.',
      detalles: [],
    });
  });

  it('un ApiError conserva el mensaje y el detalle por campo del backend', () => {
    const error = new ApiError(400, 'Datos inválidos', '/api/auth/registro', [
      'password: el tamaño debe estar entre 8 y 72',
    ]);
    expect(mensajeDeError(error)).toEqual({
      mensaje: 'Datos inválidos',
      detalles: ['password: el tamaño debe estar entre 8 y 72'],
    });
  });

  it('un 409 de negocio llega con su mensaje', () => {
    const error = new ApiError(409, 'El token de recuperacion vencio');
    expect(mensajeDeError(error).mensaje).toBe('El token de recuperacion vencio');
  });

  it('cualquier otro error da un mensaje genérico, sin filtrar el mensaje interno', () => {
    expect(mensajeDeError(new TypeError('x is undefined'))).toEqual({
      mensaje: 'Ocurrió un error inesperado.',
      detalles: [],
    });
    expect(mensajeDeError('texto')).toEqual({ mensaje: 'Ocurrió un error inesperado.', detalles: [] });
  });
});
