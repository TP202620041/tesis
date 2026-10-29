import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { olvidarCargaDelCaptcha } from '../hooks/useCaptcha';
import { MENSAJE_CAPTCHA_SIN_CARGAR, URL_SCRIPT_CAPTCHA, type ParametrosDelWidget } from '../model/captcha';
import { CampoCaptcha } from './CampoCaptcha';

type VentanaConCaptcha = Window & { turnstile?: unknown };

/** Stub de `window.turnstile`: guarda los parámetros de cada `render`. */
function instalarTurnstile() {
  const widgets: ParametrosDelWidget[] = [];
  const stub = {
    render: vi.fn((_el: HTMLElement, parametros: ParametrosDelWidget) => {
      widgets.push(parametros);
      return `widget-${widgets.length - 1}`;
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  (window as VentanaConCaptcha).turnstile = stub;
  return { stub, widgets };
}

/** Scripts de Turnstile en el documento. */
function scriptsDelCaptcha() {
  return document.head.querySelectorAll(`script[src="${URL_SCRIPT_CAPTCHA}"]`);
}

describe('CampoCaptcha (NC-08b, Turnstile)', () => {
  beforeEach(() => {
    olvidarCargaDelCaptcha();
    delete (window as VentanaConCaptcha).turnstile;
    scriptsDelCaptcha().forEach((s) => s.remove());
  });

  afterEach(() => {
    delete (window as VentanaConCaptcha).turnstile;
  });

  it('inyecta el script una sola vez aunque se monte dos veces (StrictMode)', async () => {
    const onToken = vi.fn();
    render(
      <StrictMode>
        <CampoCaptcha siteKey="clave" onToken={onToken} reinicios={0} />
      </StrictMode>,
    );
    expect(scriptsDelCaptcha()).toHaveLength(1);

    const { stub } = instalarTurnstile();
    act(() => {
      scriptsDelCaptcha()[0]!.dispatchEvent(new Event('load'));
    });

    // El montaje descartado por StrictMode no pinta: un solo widget, con la site key.
    await waitFor(() => expect(stub.render).toHaveBeenCalledTimes(1));
    expect(stub.render.mock.calls[0]![1].sitekey).toBe('clave');
    expect(scriptsDelCaptcha()).toHaveLength(1);
  });

  it('pinta en español y sin el campo oculto que Turnstile agrega al formulario', async () => {
    const { widgets } = instalarTurnstile();
    render(<CampoCaptcha siteKey="clave" onToken={vi.fn()} reinicios={0} />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    expect(widgets[0]!.language).toBe('es');
    expect(widgets[0]!['response-field']).toBe(false);
  });

  it('entrega el token al resolver y null al vencer o fallar', async () => {
    const { widgets } = instalarTurnstile();
    const onToken = vi.fn();
    render(<CampoCaptcha siteKey="clave" onToken={onToken} reinicios={0} />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    const widget = widgets[0]!;

    act(() => widget.callback('token-1'));
    expect(onToken).toHaveBeenLastCalledWith('token-1');
    act(() => widget['expired-callback']());
    expect(onToken).toHaveBeenLastCalledWith(null);
    act(() => widget.callback('token-2'));
    act(() => widget['error-callback']('300030'));
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('usa el widget compacto si el contenedor es angosto', async () => {
    const { widgets } = instalarTurnstile();
    render(<CampoCaptcha siteKey="clave" onToken={vi.fn()} reinicios={0} />);
    // jsdom no hace layout: el ancho es 0, así que elige el compacto.
    await waitFor(() => expect(widgets).toHaveLength(1));
    expect(widgets[0]!.size).toBe('compact');
  });

  it('se reinicia cuando sube el contador de reinicios', async () => {
    const { stub, widgets } = instalarTurnstile();
    const onToken = vi.fn();
    const { rerender } = render(<CampoCaptcha siteKey="clave" onToken={onToken} reinicios={0} />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    expect(stub.reset).not.toHaveBeenCalled();

    rerender(<CampoCaptcha siteKey="clave" onToken={onToken} reinicios={1} />);
    expect(stub.reset).toHaveBeenCalledWith('widget-0');
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(stub.render).toHaveBeenCalledTimes(1);
  });

  it('al desmontar quita el widget (sin reintentos ni renovaciones pendientes)', async () => {
    const { stub, widgets } = instalarTurnstile();
    const { unmount } = render(<CampoCaptcha siteKey="clave" onToken={vi.fn()} reinicios={0} />);
    await waitFor(() => expect(widgets).toHaveLength(1));

    unmount();
    expect(stub.remove).toHaveBeenCalledWith('widget-0');
  });

  it('si el script no carga, lo dice en vez de dejar un hueco', async () => {
    render(<CampoCaptcha siteKey="clave" onToken={vi.fn()} reinicios={0} />);
    act(() => {
      scriptsDelCaptcha()[0]!.dispatchEvent(new Event('error'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE_CAPTCHA_SIN_CARGAR);
    // Se quita el script fallido para que un montaje nuevo lo reintente.
    expect(scriptsDelCaptcha()).toHaveLength(0);
  });

  it('si el script carga pero no deja `window.turnstile`, también lo dice', async () => {
    render(<CampoCaptcha siteKey="clave" onToken={vi.fn()} reinicios={0} />);
    act(() => {
      scriptsDelCaptcha()[0]!.dispatchEvent(new Event('load'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE_CAPTCHA_SIN_CARGAR);
  });

  it('si `render` lanza o no devuelve id, avisa en vez de dejar un hueco', async () => {
    const { stub } = instalarTurnstile();
    stub.render.mockImplementationOnce(() => {
      throw new Error('[Cloudflare Turnstile] Invalid sitekey');
    });
    const { unmount } = render(<CampoCaptcha siteKey="clave" onToken={vi.fn()} reinicios={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE_CAPTCHA_SIN_CARGAR);
    unmount();

    stub.render.mockImplementationOnce(() => undefined as unknown as string);
    const onToken = vi.fn();
    const { rerender } = render(<CampoCaptcha siteKey="clave" onToken={onToken} reinicios={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE_CAPTCHA_SIN_CARGAR);
    // Sin id no hay nada que reiniciar ni que quitar.
    rerender(<CampoCaptcha siteKey="clave" onToken={onToken} reinicios={1} />);
    expect(stub.reset).not.toHaveBeenCalled();
    expect(stub.remove).not.toHaveBeenCalled();
  });

  it('agrupa el widget con un nombre accesible', () => {
    instalarTurnstile();
    render(<CampoCaptcha siteKey="clave" onToken={vi.fn()} reinicios={0} />);
    expect(screen.getByRole('group', { name: 'Verificación «No soy un robot»' })).toBeInTheDocument();
  });
});
