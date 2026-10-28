import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { confirmarCorreo, reenviarConfirmacion } from '../api';
import { MENSAJE_ENLACE_INVALIDO, MENSAJE_REENVIO } from '../model/confirmacion';
import { ConfirmarCuenta } from './ConfirmarCuenta';

vi.mock('../api', () => ({ confirmarCorreo: vi.fn(), reenviarConfirmacion: vi.fn() }));

const busqueda = vi.hoisted(() => ({ actual: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => busqueda.actual }));

// next/link fuera del árbol de Next: basta con un <a>.
vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

const confirmar = vi.mocked(confirmarCorreo);
const reenviar = vi.mocked(reenviarConfirmacion);
const TOKEN = '3q2-7w_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ';

function abrirEnlace(token: string | null) {
  busqueda.actual = new URLSearchParams(token === null ? '' : `token=${token}`);
  window.history.replaceState(null, '', token === null ? '/confirmar-cuenta' : `/confirmar-cuenta?token=${token}`);
}

beforeEach(() => {
  confirmar.mockReset();
  reenviar.mockReset();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ConfirmarCuenta (NC-09)', () => {
  it('confirma y lleva a iniciar sesión, sin el token en la URL', async () => {
    abrirEnlace(TOKEN);
    confirmar.mockResolvedValue(undefined);
    render(<ConfirmarCuenta />);

    // La región de estado existe desde el principio, con «Confirmando…».
    expect(screen.getByRole('status')).toHaveTextContent('Confirmando tu correo…');
    expect(await screen.findByText('¡Listo! Tu correo está confirmado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(confirmar).toHaveBeenCalledWith(TOKEN);
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('button', { name: 'Reenviar el enlace' })).not.toBeInTheDocument();
  });

  it('«ya confirmado» se muestra igual que el éxito', async () => {
    abrirEnlace(TOKEN);
    confirmar.mockRejectedValue(
      new ApiError(409, 'Tu correo ya está confirmado. Inicia sesión con tu contraseña.', '', [], 'CORREO_YA_CONFIRMADO'),
    );
    render(<ConfirmarCuenta />);

    expect(await screen.findByText('¡Listo! Tu correo está confirmado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toBeInTheDocument();
  });

  it('enlace vencido: muestra el mensaje y pide el correo para reenviar', async () => {
    abrirEnlace(TOKEN);
    const vencido = 'El enlace de confirmación venció. Pide uno nuevo desde el inicio de sesión.';
    confirmar.mockRejectedValue(new ApiError(409, vencido, '', [], 'CONFIRMACION_VENCIDA'));
    reenviar.mockResolvedValue(undefined);
    render(<ConfirmarCuenta />);

    expect(await screen.findByText(vencido)).toBeInTheDocument();
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'ana@lima.pe');
    await usuario.click(screen.getByRole('button', { name: 'Reenviar el enlace' }));

    expect(reenviar).toHaveBeenCalledWith('ana@lima.pe');
    expect(await screen.findByText(MENSAJE_REENVIO)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute('href', '/login');
  });

  it('enlace reemplazado por uno más nuevo: mensaje del backend y opción de reenviar', async () => {
    abrirEnlace(TOKEN);
    const reemplazado = 'Este enlace ya no sirve porque pediste uno nuevo. Usa el del último correo que te enviamos.';
    confirmar.mockRejectedValue(new ApiError(409, reemplazado, '', [], 'CONFIRMACION_REEMPLAZADA'));
    render(<ConfirmarCuenta />);

    expect(await screen.findByText(reemplazado)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar el enlace' })).toBeInTheDocument();
  });

  it('sin token: inválido, sin llamar al API', () => {
    abrirEnlace(null);
    render(<ConfirmarCuenta />);

    expect(screen.getByText(MENSAJE_ENLACE_INVALIDO)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar el enlace' })).toBeInTheDocument();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('token inválido según el backend', async () => {
    abrirEnlace('abc');
    confirmar.mockRejectedValue(new ApiError(409, MENSAJE_ENLACE_INVALIDO, '', [], 'CONFIRMACION_INVALIDA'));
    render(<ConfirmarCuenta />);

    expect(await screen.findByText(MENSAJE_ENLACE_INVALIDO)).toBeInTheDocument();
  });

  it('sin red: ofrece volver a intentar con el mismo enlace', async () => {
    abrirEnlace(TOKEN);
    confirmar.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce(undefined);
    render(<ConfirmarCuenta />);

    expect(await screen.findByText('Sin conexión con el servidor. Revisa tu red.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Volver a intentar' }));

    expect(await screen.findByText('¡Listo! Tu correo está confirmado')).toBeInTheDocument();
    expect(confirmar).toHaveBeenNthCalledWith(2, TOKEN);
  });
});
