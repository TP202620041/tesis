import { describe, expect, it } from 'vitest';
import { base64UrlABytes, esLaMismaClave, textoDeEstadoPush, type EstadoPush } from './push';

/** Clave publica VAPID de ejemplo (punto P-256 sin comprimir: 65 bytes). */
const CLAVE =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

describe('base64UrlABytes', () => {
  it('decodifica una clave VAPID base64url sin relleno a 65 bytes', () => {
    const bytes = base64UrlABytes(CLAVE);
    expect(bytes).toHaveLength(65);
    // Un punto sin comprimir empieza con 0x04.
    expect(bytes[0]).toBe(0x04);
  });

  it('respeta los caracteres propios de base64url (- y _)', () => {
    expect(Array.from(base64UrlABytes('-_8'))).toEqual([0xfb, 0xff]);
  });
});

describe('esLaMismaClave', () => {
  const actual = base64UrlABytes(CLAVE);

  it('reconoce la misma clave', () => {
    expect(esLaMismaClave(actual.slice().buffer, actual)).toBe(true);
  });

  it('detecta una clave rotada', () => {
    const otra = actual.slice();
    otra[10] = (otra[10] ?? 0) ^ 0xff;
    expect(esLaMismaClave(otra.buffer, actual)).toBe(false);
    expect(esLaMismaClave(new Uint8Array(3).buffer, actual)).toBe(false);
  });

  it('sin clave informada por el navegador la trata como distinta', () => {
    expect(esLaMismaClave(null, actual)).toBe(false);
    expect(esLaMismaClave(undefined, actual)).toBe(false);
  });
});

describe('textoDeEstadoPush', () => {
  it('tiene un texto para cada estado', () => {
    const estados: EstadoPush[] = ['no-soportado', 'sin-claves', 'denegado', 'inactivo', 'activo'];
    for (const e of estados) expect(textoDeEstadoPush(e)).not.toBe('');
  });
});
