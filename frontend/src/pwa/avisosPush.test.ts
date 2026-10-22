import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AVISO_GENERICO,
  elegirVentana,
  ICONO_AVISO,
  INSIGNIA_AVISO,
  leerAvisoPush,
  opcionesDeNotificacion,
  rutaInterna,
} from './avisosPush';

/** `public/` del frontend, relativo a este archivo (ver terminos.test.ts sobre `new URL`). */
const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');

/** `AnchoxAlto` de un PNG, leido del encabezado IHDR (bytes 16-23, big-endian). */
function medidasPng(archivo: string): string {
  const bytes = readFileSync(archivo);
  expect([...bytes.subarray(0, 8)], `${archivo} no es un PNG`).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.toString('latin1', 12, 16)).toBe('IHDR');
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe('leerAvisoPush', () => {
  it('traduce el payload del backend (handoff 2026-10-19-push-real)', () => {
    expect(
      leerAvisoPush({
        titulo: 'ViaSegura: su reporte esta en proceso',
        cuerpo: 'Su reporte #42 esta en proceso.',
        url: '/mis-reportes/42',
        reporteId: 42,
        estado: 'EN_PROCESO',
      }),
    ).toEqual({
      titulo: 'ViaSegura: su reporte esta en proceso',
      cuerpo: 'Su reporte #42 esta en proceso.',
      url: '/mis-reportes/42',
      tag: 'reporte-42',
    });
  });

  it.each([null, undefined, 'texto', 42, []])('con un payload ilegible (%s) muestra el aviso genérico', (datos) => {
    expect(leerAvisoPush(datos)).toEqual(AVISO_GENERICO);
  });

  it('completa lo que falte sin perder lo que vino', () => {
    expect(leerAvisoPush({ cuerpo: 'Su reporte fue resuelto.', reporteId: '7' })).toEqual({
      titulo: 'Ciudad Viva',
      cuerpo: 'Su reporte fue resuelto.',
      url: '/mis-reportes',
      tag: undefined,
    });
  });
});

describe('rutaInterna', () => {
  it('acepta rutas de la app', () => {
    expect(rutaInterna('/mis-reportes/42?x=1')).toBe('/mis-reportes/42?x=1');
  });

  it.each([
    'https://evil.example/x',
    '//evil.example',
    'javascript:alert(1)',
    '/\\evil.example',
    // WHATWG quita \t, \n y \r: sin validar tras parsear serian //evil.example.
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    // La normalizacion de puntos tambien puede dejar `//evil.example`.
    '/.//evil.example',
    '/x/..//evil.example',
    '/%2e//evil.example',
    '',
    null,
  ])('no deja salir del origen: %j', (url) => {
    expect(rutaInterna(url)).toBe('/mis-reportes');
  });
});

describe('elegirVentana', () => {
  const destino = 'https://app.pe/mis-reportes/42';

  it('enfoca la ventana que ya está en esa URL', () => {
    expect(
      elegirVentana([{ url: 'https://app.pe/mapa' }, { url: 'https://app.pe/mis-reportes/42' }], destino),
    ).toEqual({ tipo: 'enfocar', indice: 1 });
  });

  it('reutiliza otra ventana de la app navegándola', () => {
    expect(elegirVentana([{ url: 'https://otro.pe/' }, { url: 'https://app.pe/mapa' }], destino)).toEqual({
      tipo: 'navegar',
      indice: 1,
    });
  });

  it('sin ventanas de la app abre una nueva', () => {
    expect(elegirVentana([{ url: 'https://otro.pe/mis-reportes/42' }], destino)).toEqual({ tipo: 'abrir' });
    expect(elegirVentana([], destino)).toEqual({ tipo: 'abrir' });
  });
});

describe('opcionesDeNotificacion', () => {
  it('lleva el cuerpo, el tag, la ruta a abrir, el icono de la app y la insignia', () => {
    const aviso = leerAvisoPush({ titulo: 'T', cuerpo: 'Su reporte #42 fue resuelto.', url: '/mis-reportes/42', reporteId: 42 });
    expect(opcionesDeNotificacion(aviso)).toEqual({
      body: 'Su reporte #42 fue resuelto.',
      tag: 'reporte-42',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: '/mis-reportes/42' },
    });
  });

  it('el aviso genérico también lleva icono e insignia', () => {
    expect(opcionesDeNotificacion(AVISO_GENERICO)).toMatchObject({ icon: ICONO_AVISO, badge: INSIGNIA_AVISO });
  });

  // 96 px = 24 dp a densidad 4x, lo que Android pinta en la barra de estado.
  it.each([
    [ICONO_AVISO, '192x192'],
    [INSIGNIA_AVISO, '96x96'],
  ])('%s existe en public/ y es un PNG de %s (si no, el aviso sale sin imagen)', (ruta, medidas) => {
    const archivo = resolve(PUBLIC, `.${ruta}`);
    expect(existsSync(archivo), `no se encontro ${archivo}`).toBe(true);
    expect(medidasPng(archivo)).toBe(medidas);
  });
});
