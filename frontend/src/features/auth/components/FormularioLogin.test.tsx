import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { iniciarSesion, reenviarConfirmacion } from '../api';
import { MENSAJE_REENVIO } from '../model/confirmacion';
import { FormularioLogin } from './FormularioLogin';

vi.mock('../api', () => ({ iniciarSesion: vi.fn(), reenviarConfirmacion: vi.fn() }));
vi.mock('../hooks/push', () => ({ reRegistrarPushAlIniciarSesion: vi.fn() }));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const MENSAJE =
  'Confirma tu correo para iniciar sesión. Te enviamos un enlace al registrarte; si no lo encuentras, revisa la carpeta de spam o pide uno nuevo.';

async function entrar(email = 'ana@lima.pe', password = 'secreta123') {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Correo electrónico'), email);
  await usuario.type(screen.getByLabelText('Contraseña'), password);
  await usuario.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  return usuario;
}

describe('FormularioLogin con la cuenta sin confirmar (NC-09)', () => {
  beforeEach(() => {
    vi.mocked(iniciarSesion).mockReset();
    vi.mocked(reenviarConfirmacion).mockReset();
    push.mockReset();
  });

  it('el 409 CORREO_NO_CONFIRMADO muestra el aviso y reenvía el enlace al correo del formulario', async () => {
    vi.mocked(iniciarSesion).mockRejectedValue(new ApiError(409, MENSAJE, '', [], 'CORREO_NO_CONFIRMADO'));
    vi.mocked(reenviarConfirmacion).mockResolvedValue(undefined);
    render(<FormularioLogin />);
    const usuario = await entrar();

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE);
    expect(push).not.toHaveBeenCalled();

    // Cambiar el campo después no cambia a quién se reenvía.
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'x');
    const reenviar = screen.getByRole('button', { name: 'Reenviar el enlace' });
    await usuario.click(reenviar);

    expect(reenviarConfirmacion).toHaveBeenCalledWith('ana@lima.pe');
    expect(await screen.findByText(MENSAJE_REENVIO)).toBeInTheDocument();
    // Mismo mensaje neutro siempre, y 60 s antes de poder pedir otro.
    expect(reenviar).toHaveAttribute('aria-disabled', 'true');
    expect(reenviar).toHaveAccessibleDescription(/Podrás pedir otro enlace en 60 s/);
  });

  it('con credenciales inválidas no ofrece reenviar', async () => {
    vi.mocked(iniciarSesion).mockRejectedValue(new ApiError(401, 'Credenciales invalidas'));
    render(<FormularioLogin />);
    await entrar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales invalidas');
    expect(screen.queryByRole('button', { name: 'Reenviar el enlace' })).not.toBeInTheDocument();
  });
});
