import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANCHO_WIDGET_NORMAL,
  captchaConfigurado,
  IDIOMA_DEL_WIDGET,
  ORIGEN_DEL_CAPTCHA,
  siteKeyDelCaptcha,
  tamanoDelWidget,
  URL_SCRIPT_CAPTCHA,
} from './captcha';

describe('captcha (NC-08b, Turnstile)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sin site key no está configurado', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', undefined);
    expect(siteKeyDelCaptcha()).toBeNull();
    expect(captchaConfigurado()).toBe(false);
  });

  it('una site key vacía o de espacios cuenta como ausente', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '   ');
    expect(siteKeyDelCaptcha()).toBeNull();
    expect(captchaConfigurado()).toBe(false);
  });

  it('con site key está configurado y la devuelve sin espacios', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', ' 1x00000000000000000000AA ');
    expect(siteKeyDelCaptcha()).toBe('1x00000000000000000000AA');
    expect(captchaConfigurado()).toBe(true);
  });

  it('ya no lee la variable de reCAPTCHA', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', undefined);
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', 'clave-vieja');
    expect(captchaConfigurado()).toBe(false);
  });

  it('el script es la URL exacta de Cloudflare, en modo explícito', () => {
    // Cloudflare avisa que fijar o cachear otra URL rompe el widget al actualizarlo.
    expect(URL_SCRIPT_CAPTCHA).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    const url = new URL(URL_SCRIPT_CAPTCHA);
    expect(url.origin).toBe(ORIGEN_DEL_CAPTCHA);
    expect(url.searchParams.get('render')).toBe('explicit');
  });

  it('pide los textos en español con un código que Turnstile admite', () => {
    // En español Turnstile solo admite `es` y `es-es`; con un código no
    // admitido cae al inglés (guía de Cloudflare, «Widget configurations»).
    expect(['es', 'es-es']).toContain(IDIOMA_DEL_WIDGET);
  });

  it('usa el widget compacto cuando el normal (300 px) no cabe', () => {
    expect(ANCHO_WIDGET_NORMAL).toBe(300);
    expect(tamanoDelWidget(ANCHO_WIDGET_NORMAL)).toBe('normal');
    expect(tamanoDelWidget(400)).toBe('normal');
    expect(tamanoDelWidget(ANCHO_WIDGET_NORMAL - 1)).toBe('compact');
    expect(tamanoDelWidget(0)).toBe('compact');
  });
});
