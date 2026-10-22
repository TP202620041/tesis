import { describe, expect, it } from 'vitest';
import {
  ACEPTA_FOTO,
  AYUDA_DE_FOTO,
  errorDeFoto,
  MENSAJE_FORMATO_DE_FOTO,
  MENSAJE_TAMANO_DE_FOTO,
  type FotoElegida,
} from './fotoParaSubir';

const MB = 1024 * 1024;

const foto = (cambios: Partial<FotoElegida> = {}): FotoElegida => ({
  name: 'bache.jpg',
  type: 'image/jpeg',
  size: 3 * MB,
  ...cambios,
});

describe('errorDeFoto (DEP-11)', () => {
  it('acepta JPG, JPEG, PNG y WEBP', () => {
    expect(errorDeFoto(foto())).toBeNull();
    expect(errorDeFoto(foto({ name: 'bache.jpeg' }))).toBeNull();
    expect(errorDeFoto(foto({ name: 'bache.png', type: 'image/png' }))).toBeNull();
    expect(errorDeFoto(foto({ name: 'bache.webp', type: 'image/webp' }))).toBeNull();
  });

  it('la extensión no distingue mayúsculas, como el backend', () => {
    expect(errorDeFoto(foto({ name: 'IMG_0042.JPG' }))).toBeNull();
    expect(errorDeFoto(foto({ name: 'captura.PnG', type: 'image/png' }))).toBeNull();
  });

  it('el límite son 10 MB exactos (10 × 1024 × 1024 bytes); un byte más ya no', () => {
    expect(errorDeFoto(foto({ size: 10 * MB }))).toBeNull();
    expect(errorDeFoto(foto({ size: 10 * MB + 1 }))).toBe(MENSAJE_TAMANO_DE_FOTO);
    expect(errorDeFoto(foto({ size: 40 * MB }))).toBe('La foto supera 10 MB.');
  });

  it('rechaza otros formatos por la extensión o por el tipo que declara el navegador', () => {
    expect(errorDeFoto(foto({ name: 'animado.gif', type: 'image/gif' }))).toBe(
      MENSAJE_FORMATO_DE_FOTO,
    );
    expect(errorDeFoto(foto({ name: 'IMG_0042.HEIC', type: 'image/heic' }))).toBe(
      'Formato no permitido. Usa JPG, PNG o WEBP.',
    );
    // Extensión admitida, pero el navegador dice que es otra cosa.
    expect(errorDeFoto(foto({ name: 'bache.jpg', type: 'image/gif' }))).toBe(
      MENSAJE_FORMATO_DE_FOTO,
    );
    // Tipo admitido, pero el backend rechaza el nombre sin extensión válida.
    expect(errorDeFoto(foto({ name: 'bache', type: 'image/jpeg' }))).toBe(MENSAJE_FORMATO_DE_FOTO);
    expect(errorDeFoto(foto({ name: 'bache.', type: 'image/jpeg' }))).toBe(MENSAJE_FORMATO_DE_FOTO);
    expect(errorDeFoto(foto({ name: 'bache.jpg.exe', type: '' }))).toBe(MENSAJE_FORMATO_DE_FOTO);
  });

  it('un tipo vacío no se rechaza si la extensión es válida (el contenido lo mira el backend)', () => {
    expect(errorDeFoto(foto({ name: 'bache.webp', type: '' }))).toBeNull();
  });

  it('el formato va antes que el tamaño', () => {
    expect(errorDeFoto(foto({ name: 'video.mp4', type: 'video/mp4', size: 50 * MB }))).toBe(
      MENSAJE_FORMATO_DE_FOTO,
    );
  });

  it('el accept del selector y la ayuda dicen lo mismo que la regla', () => {
    expect(ACEPTA_FOTO).toBe('image/jpeg,image/png,image/webp');
    expect(AYUDA_DE_FOTO).toBe('JPG, PNG o WEBP, de hasta 10 MB.');
  });
});
