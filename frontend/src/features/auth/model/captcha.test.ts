import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANCHO_WIDGET_NORMAL,
  captchaConfigurado,
  siteKeyDelCaptcha,
  tamanoDelWidget,
  URL_SCRIPT_CAPTCHA,
} from './captcha';

describe('captcha (NC-08)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sin site key no está configurado', () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', undefined);
    expect(siteKeyDelCaptcha()).toBeNull();
    expect(captchaConfigurado()).toBe(false);
  });

  it('una site key vacía o de espacios cuenta como ausente', () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', '   ');
    expect(siteKeyDelCaptcha()).toBeNull();
    expect(captchaConfigurado()).toBe(false);
  });

  it('con site key está configurado y la devuelve sin espacios', () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', ' clave-publica ');
    expect(siteKeyDelCaptcha()).toBe('clave-publica');
    expect(captchaConfigurado()).toBe(true);
  });

  it('el script es el de Google, en modo explícito y en español', () => {
    const url = new URL(URL_SCRIPT_CAPTCHA);
    expect(url.origin).toBe('https://www.google.com');
    expect(url.pathname).toBe('/recaptcha/api.js');
    expect(url.searchParams.get('render')).toBe('explicit');
    expect(url.searchParams.get('hl')).toBe('es');
  });

  it('el script cae bajo la ruta /recaptcha/ que permite la CSP de next.config.ts', () => {
    // La CSP no abre www.google.com entero, solo `https://www.google.com/recaptcha/`.
    expect(URL_SCRIPT_CAPTCHA.startsWith('https://www.google.com/recaptcha/')).toBe(true);
  });

  it('usa el widget compacto cuando el normal no cabe', () => {
    expect(tamanoDelWidget(ANCHO_WIDGET_NORMAL)).toBe('normal');
    expect(tamanoDelWidget(400)).toBe('normal');
    expect(tamanoDelWidget(ANCHO_WIDGET_NORMAL - 1)).toBe('compact');
    expect(tamanoDelWidget(0)).toBe('compact');
  });
});
