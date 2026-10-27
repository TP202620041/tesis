import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { olvidarCargaDelCaptcha } from '../hooks/useCaptcha';
import { MENSAJE_CAPTCHA_SIN_CARGAR, URL_SCRIPT_CAPTCHA, type ParametrosDelWidget } from '../model/captcha';
import { CampoCaptcha } from './CampoCaptcha';

type VentanaConCaptcha = Window & { grecaptcha?: unknown };

/** Stub de `window.grecaptcha`: guarda los parámetros de cada `render`. */
function instalarGrecaptcha() {
  const widgets: ParametrosDelWidget[] = [];
  const stub = {
    ready: vi.fn((alListo: () => void) => alListo()),
    render: vi.fn((_el: HTMLElement, parametros: ParametrosDelWidget) => {
      widgets.push(parametros);
      return widgets.length - 1;
    }),
    reset: vi.fn(),
  };
  (window as VentanaConCaptcha).grecaptcha = stub;
  return { stub, widgets };
}

/** Scripts de reCAPTCHA en el documento. */
function scriptsDelCaptcha() {
  return document.head.querySelectorAll(`script[src="${URL_SCRIPT_CAPTCHA}"]`);
}

describe('CampoCaptcha (NC-08)', () => {
  beforeEach(() => {
    olvidarCargaDelCaptcha();
    delete (window as VentanaConCaptcha).grecaptcha;
    scriptsDelCaptcha().forEach((s) => s.remove());
  });

  afterEach(() => {
    delete (window as VentanaConCaptcha).grecaptcha;
  });

  it('inyecta el script una sola vez aunque se monte dos veces (StrictMode)', async () => {
    const onToken = vi.fn();
    render(
      <StrictMode>
        <CampoCaptcha siteKey="clave" onToken={onToken} reinicios={0} />
      </StrictMode>,
    );
    expect(scriptsDelCaptcha()).toHaveLength(1);

    const { stub } = instalarGrecaptcha();
    act(() => {
      scriptsDelCaptcha()[0]!.dispatchEvent(new Event('load'));
    });

    // El montaje descartado por StrictMode no pinta: un solo widget, con la site key.
    await waitFor(() => expect(stub.render).toHaveBeenCalledTimes(1));
    expect(stub.render.mock.calls[0]![1].sitekey).toBe('clave');
    expect(scriptsDelCaptcha()).toHaveLength(1);
  });

  it('entrega el token al resolver y null al expirar o fallar', async () => {
    const { widgets } = instalarGrecaptcha();
    const onToken = vi.fn();
    render(<CampoCaptcha siteKey="clave" onToken={onToken} reinicios={0} />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    const widget = widgets[0]!;

    act(() => widget.callback('token-1'));
    expect(onToken).toHaveBeenLastCalledWith('token-1');
    act(() => widget['expired-callback']());
    expect(onToken).toHaveBeenLastCalledWith(null);
    act(() => widget.callback('token-2'));
    act(() => widget['error-callback']());
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('usa el widget compacto si el contenedor es angosto', async () => {
    const { widgets } = instalarGrecaptcha();
    render(<CampoCaptcha siteKey="clave" onToken={vi.fn()} reinicios={0} />);
    // jsdom no hace layout: el ancho es 0, así que elige el compacto.
    await waitFor(() => expect(widgets).toHaveLength(1));
    expect(widgets[0]!.size).toBe('compact');
  });

  it('se reinicia cuando sube el contador de reinicios', async () => {
    const { stub, widgets } = instalarGrecaptcha();
    const onToken = vi.fn();
    const { rerender } = render(<CampoCaptcha siteKey="clave" onToken={onToken} reinicios={0} />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    expect(stub.reset).not.toHaveBeenCalled();

    rerender(<CampoCaptcha siteKey="clave" onToken={onToken} reinicios={1} />);
    expect(stub.reset).toHaveBeenCalledWith(0);
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(stub.render).toHaveBeenCalledTimes(1);
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

  it('agrupa el widget con un nombre accesible', () => {
    instalarGrecaptcha();
    render(<CampoCaptcha siteKey="clave" onToken={vi.fn()} reinicios={0} />);
    expect(screen.getByRole('group', { name: 'Verificación «No soy un robot»' })).toBeInTheDocument();
  });
});
