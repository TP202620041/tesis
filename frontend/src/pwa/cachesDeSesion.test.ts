import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE_ENTRE_ORIGENES, borrarCacheEntreOrigenes, esPeticionAlApi } from './cachesDeSesion';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('esPeticionAlApi', () => {
  it('reconoce las rutas del backend, en cualquier origen', () => {
    expect(esPeticionAlApi(new URL('http://localhost:8080/api/auth/me'))).toBe(true);
    expect(esPeticionAlApi(new URL('http://localhost:8080/api/reportes/mis-reportes'))).toBe(true);
    expect(esPeticionAlApi(new URL('http://localhost:8080/api/desempeno/mi-distrito'))).toBe(true);
    expect(esPeticionAlApi(new URL('https://api.viasegura.pe/api/reportes/exportar?formato=CSV'))).toBe(true);
  });

  it('deja fuera lo que sí puede cachearse: tiles, fotos públicas y la propia app', () => {
    expect(esPeticionAlApi(new URL('https://a.tile.openstreetmap.org/15/9/3.png'))).toBe(false);
    expect(esPeticionAlApi(new URL('http://localhost:8080/media/fotos/reportes/x.png'))).toBe(false);
    expect(esPeticionAlApi(new URL('http://localhost:3000/mis-reportes'))).toBe(false);
    // Solo el prefijo exacto `/api/`.
    expect(esPeticionAlApi(new URL('http://localhost:3000/apiario'))).toBe(false);
  });
});

describe('borrarCacheEntreOrigenes', () => {
  it('borra la caché cross-origin', async () => {
    const borrar = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('caches', { delete: borrar });

    await borrarCacheEntreOrigenes();

    expect(borrar).toHaveBeenCalledWith(CACHE_ENTRE_ORIGENES);
    expect(CACHE_ENTRE_ORIGENES).toBe('cross-origin');
  });

  it('sin Cache Storage (jsdom) no hace nada ni falla', async () => {
    expect(typeof caches).toBe('undefined');
    await expect(borrarCacheEntreOrigenes()).resolves.toBeUndefined();
  });

  it('si el navegador rechaza el borrado, el cierre de sesión no falla', async () => {
    vi.stubGlobal('caches', { delete: vi.fn(() => Promise.reject(new Error('SecurityError'))) });
    await expect(borrarCacheEntreOrigenes()).resolves.toBeUndefined();
  });
});
