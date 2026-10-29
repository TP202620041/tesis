import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORIGEN_DEL_CAPTCHA } from '@/features/auth/model/captcha';

/**
 * CSP y guardas de `next.config.ts` para el captcha del registro (NC-08b).
 * Un origen que falte en la CSP no da error en ningún build: el navegador
 * bloquea en silencio y el widget queda en blanco, así que se fija aquí.
 */

/** Carga `next.config.ts` desde cero con el entorno dado. */
async function cargarConfig(entorno: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [clave, valor] of Object.entries(entorno)) vi.stubEnv(clave, valor);
  return (await import('../../next.config')).default;
}

/** Directivas de la CSP, como `{ 'script-src': ['self', …] }`. */
async function directivasDeLaCsp(): Promise<Record<string, string[]>> {
  const config = await cargarConfig();
  const reglas = await config.headers!();
  const csp = reglas[0]!.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
  return Object.fromEntries(
    csp.split('; ').map((directiva) => {
      const [nombre, ...fuentes] = directiva.split(' ');
      return [nombre!, fuentes];
    }),
  );
}

const DESPLIEGUE_DE_VERCEL = {
  VERCEL_ENV: 'production',
  NEXT_PUBLIC_API_BASE_URL: 'https://api.ciudadviva.app',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CSP del captcha (NC-08b, Turnstile)', () => {
  it('abre el host de Turnstile en script-src, frame-src y connect-src', async () => {
    const csp = await directivasDeLaCsp();
    expect(ORIGEN_DEL_CAPTCHA).toBe('https://challenges.cloudflare.com');
    expect(csp['script-src']).toContain(ORIGEN_DEL_CAPTCHA);
    expect(csp['frame-src']).toContain(ORIGEN_DEL_CAPTCHA);
    // El Service Worker repite con `fetch()` el script; `api.js` además manda
    // sus avisos de diagnóstico desde la página.
    expect(csp['connect-src']).toContain(ORIGEN_DEL_CAPTCHA);
  });

  it('el iframe del widget es lo único que frame-src deja pasar', async () => {
    const csp = await directivasDeLaCsp();
    expect(csp['frame-src']).toEqual([ORIGEN_DEL_CAPTCHA]);
  });

  it('ya no abre ningún origen de Google (reCAPTCHA se quitó)', async () => {
    const csp = await directivasDeLaCsp();
    const fuentes = Object.values(csp).flat().join(' ');
    expect(fuentes).not.toMatch(/google|gstatic|recaptcha/i);
  });

  it('nunca abre comodines', async () => {
    const csp = await directivasDeLaCsp();
    expect(Object.values(csp).flat()).not.toContain('*');
    expect(Object.values(csp).flat().some((fuente) => fuente.includes('*.'))).toBe(false);
  });
});

describe('site key de Turnstile en un despliegue de Vercel (NC-08b)', () => {
  it('sin NEXT_PUBLIC_TURNSTILE_SITE_KEY el build falla y dice cuál falta', async () => {
    await expect(
      cargarConfig({ ...DESPLIEGUE_DE_VERCEL, NEXT_PUBLIC_TURNSTILE_SITE_KEY: '  ' }),
    ).rejects.toThrow(/Falta NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it('la variable vieja de reCAPTCHA no la reemplaza', async () => {
    await expect(
      cargarConfig({
        ...DESPLIEGUE_DE_VERCEL,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined,
        NEXT_PUBLIC_RECAPTCHA_SITE_KEY: 'clave-vieja',
      }),
    ).rejects.toThrow(/NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it('con la site key el build sigue', async () => {
    const config = await cargarConfig({ ...DESPLIEGUE_DE_VERCEL, NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAA' });
    expect(config.headers).toBeTypeOf('function');
  });

  it('en local y en la CI no se exige', async () => {
    const config = await cargarConfig({ VERCEL_ENV: undefined, NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined });
    expect(config.headers).toBeTypeOf('function');
  });
});
