import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { SesionIniciada } from '@/lib/types/domain';
import { registrar } from '../api';
import { olvidarCargaDelCaptcha } from '../hooks/useCaptcha';
import { MENSAJE_FALTA_CAPTCHA, type ParametrosDelWidget } from '../model/captcha';
import { FormularioRegistro } from './FormularioRegistro';

vi.mock('../api', () => ({ registrar: vi.fn() }));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const registrarMock = vi.mocked(registrar);

type VentanaConCaptcha = Window & { grecaptcha?: unknown };

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

async function llenarYEnviar() {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Nombre'), 'Ana');
  await usuario.type(screen.getByLabelText('Apellido'), 'Quispe');
  await usuario.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.pe');
  await usuario.type(screen.getByLabelText(/^Contraseña/), 'claveSegura9');
  await usuario.click(screen.getByRole('checkbox'));
  await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

const SESION = { token: 't', usuario: { rol: 'CIUDADANO' } } as unknown as SesionIniciada;

describe('FormularioRegistro con captcha (NC-08)', () => {
  beforeEach(() => {
    registrarMock.mockReset();
    push.mockReset();
    olvidarCargaDelCaptcha();
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', 'clave-de-prueba');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as VentanaConCaptcha).grecaptcha;
  });

  it('sin resolver la casilla no envía y muestra el error en línea', async () => {
    instalarGrecaptcha();
    render(<FormularioRegistro textoLegal={<p>Términos</p>} />);
    await llenarYEnviar();

    expect(registrarMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(MENSAJE_FALTA_CAPTCHA);
  });

  it('con la casilla resuelta manda el token en el cuerpo', async () => {
    const { widgets } = instalarGrecaptcha();
    registrarMock.mockResolvedValue(SESION);
    render(<FormularioRegistro textoLegal={<p>Términos</p>} />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    act(() => widgets[0]!.callback('token-google'));

    await llenarYEnviar();

    expect(registrarMock).toHaveBeenCalledWith(expect.objectContaining({ captchaToken: 'token-google' }));
    expect(screen.queryByText(MENSAJE_FALTA_CAPTCHA)).not.toBeInTheDocument();
  });

  it('tras un 409 del captcha reinicia el widget y exige una casilla nueva', async () => {
    const { stub, widgets } = instalarGrecaptcha();
    registrarMock.mockRejectedValue(new ApiError(409, 'No pudimos confirmar que no eres un robot. Vuelve a intentarlo.'));
    render(<FormularioRegistro textoLegal={<p>Términos</p>} />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    act(() => widgets[0]!.callback('token-usado'));

    await llenarYEnviar();

    expect(await screen.findByText(/No pudimos confirmar que no eres un robot/)).toBeInTheDocument();
    expect(stub.reset).toHaveBeenCalledWith(0);
    // La casilla de términos sigue marcada (QA-1 M-2): solo el captcha se repite.
    expect(screen.getByRole('checkbox')).toBeChecked();

    // Reenviar sin resolver de nuevo no llama al API: el token viejo se borró.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(registrarMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(MENSAJE_FALTA_CAPTCHA)).toBeInTheDocument();
  });

  it('sin site key no muestra el widget y envía sin captchaToken', async () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', '');
    const { stub } = instalarGrecaptcha();
    registrarMock.mockResolvedValue(SESION);
    render(<FormularioRegistro textoLegal={<p>Términos</p>} />);

    expect(screen.queryByRole('group', { name: /No soy un robot/ })).not.toBeInTheDocument();
    await llenarYEnviar();

    expect(stub.render).not.toHaveBeenCalled();
    expect(registrarMock).toHaveBeenCalledTimes(1);
    expect(registrarMock.mock.calls[0]![0]).not.toHaveProperty('captchaToken');
  });
});
