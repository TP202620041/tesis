import { describe, expect, it } from 'vitest';
import type { ErrorDelApi } from '@/lib/types/moderacion';
import {
  esFotoNoPermitida,
  esModeracionNoDisponible,
  MENSAJE_MODERACION_NO_DISPONIBLE,
  motivoDeRechazoEnLaCola,
  rechazoAlCrear,
} from './moderacion';

const TEXTOS = { titulo: 'Bache profundo', descripcion: 'cerca del parque' };

const error = (
  status: number,
  codigo: string | null,
  details: string[] = [],
  message = 'Mensaje del backend',
): ErrorDelApi => ({ status, codigo, details, message });

describe('rechazoAlCrear (NC-10c)', () => {
  it('400 FOTO_NO_PERMITIDA: quitar la foto', () => {
    expect(rechazoAlCrear(error(400, 'FOTO_NO_PERMITIDA', ['foto']), TEXTOS)).toEqual({
      tipo: 'foto-no-permitida',
    });
  });

  it('400 TEXTO_NO_PERMITIDO en el título o la descripción: al campo, con lo enviado', () => {
    expect(
      rechazoAlCrear(error(400, 'TEXTO_NO_PERMITIDO', ['titulo'], 'El título tiene…'), TEXTOS),
    ).toEqual({
      tipo: 'texto-no-permitido',
      texto: { campo: 'titulo', mensaje: 'El título tiene…', valor: 'Bache profundo' },
    });
    expect(rechazoAlCrear(error(400, 'TEXTO_NO_PERMITIDO', ['descripcion']), TEXTOS)).toMatchObject({
      texto: { campo: 'descripcion', valor: 'cerca del parque' },
    });
  });

  it('un TEXTO_NO_PERMITIDO de un campo que la creación no tiene no se asigna', () => {
    expect(rechazoAlCrear(error(400, 'TEXTO_NO_PERMITIDO', ['nombre']), TEXTOS)).toBeNull();
  });

  it('503 MODERACION_NO_DISPONIBLE: las dos salidas, con el mensaje del backend', () => {
    expect(rechazoAlCrear(error(503, 'MODERACION_NO_DISPONIBLE', [], 'Sin revisar'), TEXTOS)).toEqual({
      tipo: 'moderacion-no-disponible',
      mensaje: 'Sin revisar',
    });
    expect(rechazoAlCrear(error(503, 'MODERACION_NO_DISPONIBLE', [], ''), TEXTOS)).toEqual({
      tipo: 'moderacion-no-disponible',
      mensaje: MENSAJE_MODERACION_NO_DISPONIBLE,
    });
  });

  it('otros errores (y los mismos códigos con otro status) siguen como hasta ahora', () => {
    expect(rechazoAlCrear(error(503, null), TEXTOS)).toBeNull();
    expect(rechazoAlCrear(error(409, null), TEXTOS)).toBeNull();
    expect(rechazoAlCrear(error(400, null, ['titulo: no puede estar vacío']), TEXTOS)).toBeNull();
    expect(rechazoAlCrear(error(409, 'FOTO_NO_PERMITIDA'), TEXTOS)).toBeNull();
    expect(rechazoAlCrear(error(500, 'MODERACION_NO_DISPONIBLE'), TEXTOS)).toBeNull();
  });
});

describe('esFotoNoPermitida y esModeracionNoDisponible (NC-10c)', () => {
  it('van por status y código', () => {
    expect(esFotoNoPermitida({ status: 400, codigo: 'FOTO_NO_PERMITIDA' })).toBe(true);
    expect(esFotoNoPermitida({ status: 400, codigo: 'TEXTO_NO_PERMITIDO' })).toBe(false);
    expect(esModeracionNoDisponible({ status: 503, codigo: 'MODERACION_NO_DISPONIBLE' })).toBe(true);
    expect(esModeracionNoDisponible({ status: 503, codigo: null })).toBe(false);
  });
});

describe('motivoDeRechazoEnLaCola (NC-10c)', () => {
  it('la foto no permitida: el motivo dice qué hacer desde la cola, sin «Toma otra»', () => {
    const motivo = motivoDeRechazoEnLaCola(
      error(400, 'FOTO_NO_PERMITIDA', ['foto'], 'La foto no está permitida. Toma otra.'),
    );
    expect(motivo).toBe(
      'La foto no está permitida. Descártalo y vuelve a reportar el daño con otra foto o sin ella.',
    );
  });

  it('el texto no permitido: nombra el campo, sin la palabra ni «Cámbiala»', () => {
    expect(
      motivoDeRechazoEnLaCola(error(400, 'TEXTO_NO_PERMITIDO', ['descripcion'], 'La descripción tiene…')),
    ).toBe(
      'La descripción tiene palabras que no están permitidas. Descártalo y vuelve a reportar el daño sin ellas.',
    );
    expect(motivoDeRechazoEnLaCola(error(400, 'TEXTO_NO_PERMITIDO', ['titulo']))).toMatch(
      /^El título tiene palabras que no están permitidas\./,
    );
  });

  it('cualquier otro rechazo conserva el mensaje del backend tal cual', () => {
    expect(motivoDeRechazoEnLaCola(error(409, null, [], 'Fuera de Lima'))).toBe('Fuera de Lima');
    expect(motivoDeRechazoEnLaCola(error(400, 'TEXTO_NO_PERMITIDO', [], 'Sin campo'))).toBe('Sin campo');
  });
});
