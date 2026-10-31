import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORIGEN_DEL_CAPTCHA, URL_SCRIPT_CAPTCHA } from '@/features/auth/model/captcha';
import { RUTA_CONFIRMAR_CUENTA } from '@/features/auth/model/rutas';
import {
  CACHE_ENTRE_ORIGENES,
  ORIGEN_DEL_CAPTCHA_SIN_CACHE,
  RUTA_CON_TOKEN_EN_LA_URL,
  borrarCacheEntreOrigenes,
  esPaginaConTokenEnLaUrl,
  esPeticionAlApi,
  esPeticionAlCaptcha,
} from './cachesDeSesion';

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

describe('esPaginaConTokenEnLaUrl (NC-09)', () => {
  it('es la misma ruta que la página de confirmación de la app', () => {
    // El SW no puede importar de features (se compila aparte): si alguien
    // mueve la página, el token volvería a quedar en la caché sin avisar.
    expect(RUTA_CON_TOKEN_EN_LA_URL).toBe(RUTA_CONFIRMAR_CUENTA);
  });

  it('reconoce la página del enlace, con o sin token y con barra final', () => {
    expect(esPaginaConTokenEnLaUrl(new URL('https://ciudadviva.app/confirmar-cuenta?token=abc'))).toBe(true);
    expect(esPaginaConTokenEnLaUrl(new URL('http://localhost:3000/confirmar-cuenta'))).toBe(true);
    expect(esPaginaConTokenEnLaUrl(new URL('http://localhost:3000/confirmar-cuenta/'))).toBe(true);
  });

  it('deja que el resto de páginas se cacheen como siempre', () => {
    expect(esPaginaConTokenEnLaUrl(new URL('http://localhost:3000/login'))).toBe(false);
    expect(esPaginaConTokenEnLaUrl(new URL('http://localhost:3000/confirmar-cuenta-x'))).toBe(false);
    expect(esPaginaConTokenEnLaUrl(new URL('http://localhost:3000/recuperar-password?token=abc'))).toBe(false);
  });
});

describe('esPeticionAlCaptcha (NC-08b)', () => {
  it('es el mismo origen que carga el registro', () => {
    // El SW no puede importar de features: si el captcha cambia de origen,
    // su script volvería a quedar en la caché sin avisar.
    expect(ORIGEN_DEL_CAPTCHA_SIN_CACHE).toBe(ORIGEN_DEL_CAPTCHA);
  });

  it('reconoce el script, su versión redirigida y lo que pide el widget', () => {
    expect(esPeticionAlCaptcha(new URL(URL_SCRIPT_CAPTCHA))).toBe(true);
    expect(esPeticionAlCaptcha(new URL('https://challenges.cloudflare.com/turnstile/v0/g/abc123/api.js'))).toBe(true);
    expect(
      esPeticionAlCaptcha(new URL('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/fr')),
    ).toBe(true);
  });

  it('no toca otros orígenes, aunque se parezcan', () => {
    expect(esPeticionAlCaptcha(new URL('https://tile.openstreetmap.org/15/9/3.png'))).toBe(false);
    expect(esPeticionAlCaptcha(new URL('https://cdnjs.cloudflare.com/ajax/libs/x.js'))).toBe(false);
    expect(esPeticionAlCaptcha(new URL('https://challenges.cloudflare.com.ejemplo.pe/api.js'))).toBe(false);
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
