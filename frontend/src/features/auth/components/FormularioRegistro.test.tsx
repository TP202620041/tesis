import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { CuentaPorConfirmar } from '@/lib/types/domain';
import { registrar, reenviarConfirmacion } from '../api';
import { olvidarCargaDelCaptcha } from '../hooks/useCaptcha';
import { MENSAJE_FALTA_CAPTCHA, type ParametrosDelWidget } from '../model/captcha';
import { FormularioRegistro } from './FormularioRegistro';

vi.mock('../api', () => ({ registrar: vi.fn(), reenviarConfirmacion: vi.fn() }));

const push = vi.fn();
const busqueda = vi.hoisted(() => ({ actual: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => busqueda.actual,
}));

// next/link fuera del árbol de Next: basta con un <a>.
vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
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

const CUENTA: CuentaPorConfirmar = { email: 'ana@correo.pe', vigenciaEnlaceHoras: 24 };

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
    registrarMock.mockResolvedValue(CUENTA);
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
    registrarMock.mockResolvedValue(CUENTA);
    render(<FormularioRegistro textoLegal={<p>Términos</p>} />);

    expect(screen.queryByRole('group', { name: /No soy un robot/ })).not.toBeInTheDocument();
    await llenarYEnviar();

    expect(stub.render).not.toHaveBeenCalled();
    expect(registrarMock).toHaveBeenCalledTimes(1);
    expect(registrarMock.mock.calls[0]![0]).not.toHaveProperty('captchaToken');
  });
});

describe('FormularioRegistro: confirmación del correo (NC-09)', () => {
  beforeEach(() => {
    registrarMock.mockReset();
    vi.mocked(reenviarConfirmacion).mockReset();
    push.mockReset();
    busqueda.actual = new URLSearchParams();
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as VentanaConCaptcha).grecaptcha;
  });

  it('al crear la cuenta no entra: muestra «Revisa tu correo» con el correo y la vigencia', async () => {
    registrarMock.mockResolvedValue({ email: 'ana@lima.pe', vigenciaEnlaceHoras: 24 });
    render(<FormularioRegistro textoLegal={<p>Términos</p>} />);
    await llenarYEnviar();

    const titulo = await screen.findByRole('heading', { name: 'Revisa tu correo' });
    // El foco pasa al resultado: el formulario que lo tenía ya no está.
    expect(titulo).toHaveFocus();
    expect(screen.getByText('ana@lima.pe')).toBeInTheDocument();
    expect(screen.getByText(/Vence en 24 horas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear cuenta' })).not.toBeInTheDocument();
    // No hay sesión: no navega a ninguna pantalla privada.
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute('href', '/login');
  });

  it('el reenvío espera 60 s desde el registro y el login conserva el ?redirect=', async () => {
    busqueda.actual = new URLSearchParams('redirect=/reportar');
    registrarMock.mockResolvedValue(CUENTA);
    render(<FormularioRegistro textoLegal={<p>Términos</p>} />);
    await llenarYEnviar();

    const reenviar = await screen.findByRole('button', { name: 'Reenviar el enlace' });
    expect(reenviar).toHaveAttribute('aria-disabled', 'true');
    expect(reenviar).toHaveAccessibleDescription(/Podrás pedir otro enlace en 60 s/);
    await userEvent.setup().click(reenviar);
    expect(reenviarConfirmacion).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Freportar',
    );
  });

  it('un correo desechable se marca en el campo y desaparece al corregirlo', async () => {
    const mensaje =
      'No aceptamos correos temporales o desechables. Usa una dirección que revises seguido: ahí te avisaremos cómo avanzan tus reportes.';
    registrarMock.mockRejectedValue(new ApiError(409, mensaje, '', [], 'CORREO_DESECHABLE'));
    render(<FormularioRegistro textoLegal={<p>Términos</p>} />);
    await llenarYEnviar();

    const correo = screen.getByLabelText('Correo electrónico');
    await waitFor(() => expect(correo).toHaveAttribute('aria-invalid', 'true'));
    expect(correo).toHaveAccessibleDescription(mensaje);
    // En el campo, no como error general del formulario.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('checkbox')).toBeChecked();

    await userEvent.setup().type(correo, 'x');
    expect(correo).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(mensaje)).not.toBeInTheDocument();
  });

  it('tras un dominio rechazado también reinicia el captcha (ya se gastó)', async () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', 'clave-de-prueba');
    olvidarCargaDelCaptcha();
    const { stub, widgets } = instalarGrecaptcha();
    registrarMock.mockRejectedValue(
      new ApiError(409, 'El dominio «gmail.con» no puede recibir correos.', '', [], 'DOMINIO_SIN_CORREO'),
    );
    render(<FormularioRegistro textoLegal={<p>Términos</p>} />);
    await waitFor(() => expect(widgets).toHaveLength(1));
    act(() => widgets[0]!.callback('token-google'));

    await llenarYEnviar();

    expect(await screen.findByText(/no puede recibir correos/)).toBeInTheDocument();
    expect(stub.reset).toHaveBeenCalledWith(0);
  });
});
