import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { CerrarSesionEnTodos } from './CerrarSesionEnTodos';
import { cerrarSesion, cerrarSesionesEnTodosLosDispositivos } from '../api';
import { bajaDePushAlCerrarSesion } from '../hooks/push';

const replace = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../api', () => ({ cerrarSesion: vi.fn(), cerrarSesionesEnTodosLosDispositivos: vi.fn() }));
vi.mock('../hooks/push', () => ({ bajaDePushAlCerrarSesion: vi.fn() }));

// jsdom no implementa `showModal`/`close` de <dialog>: lo minimo del navegador.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  replace.mockReset();
  vi.mocked(cerrarSesion).mockReset();
  vi.mocked(cerrarSesionesEnTodosLosDispositivos).mockReset();
  vi.mocked(bajaDePushAlCerrarSesion).mockReset();
});

const NOMBRE_DIALOGO = '¿Cerrar sesión en todos los dispositivos?';

async function abrir() {
  const usuario = userEvent.setup();
  render(<CerrarSesionEnTodos />);
  await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión en todos los dispositivos' }));
  return { usuario, dialogo: screen.getByRole('dialog', { name: NOMBRE_DIALOGO }) };
}

describe('CerrarSesionEnTodos (US-04 Esc. 2)', () => {
  it('pide confirmación antes de llamar al servidor; cancelar no cierra nada', async () => {
    const { usuario, dialogo } = await abrir();
    expect(dialogo).toHaveTextContent('en todos los demás donde hayas entrado');
    expect(cerrarSesionesEnTodosLosDispositivos).not.toHaveBeenCalled();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(cerrarSesionesEnTodosLosDispositivos).not.toHaveBeenCalled();
    expect(cerrarSesion).not.toHaveBeenCalled();
  });

  it('al confirmar revoca en el servidor y después cierra la sesión local', async () => {
    vi.mocked(bajaDePushAlCerrarSesion).mockResolvedValue();
    vi.mocked(cerrarSesionesEnTodosLosDispositivos).mockResolvedValue();
    const { usuario, dialogo } = await abrir();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cerrar todas las sesiones' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(cerrarSesionesEnTodosLosDispositivos).toHaveBeenCalledTimes(1);
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
    // Orden: baja de push (necesita el token) → revocación → token local fuera → login.
    const [push] = vi.mocked(bajaDePushAlCerrarSesion).mock.invocationCallOrder;
    const [revocar] = vi.mocked(cerrarSesionesEnTodosLosDispositivos).mock.invocationCallOrder;
    const [local] = vi.mocked(cerrarSesion).mock.invocationCallOrder;
    expect(push).toBeLessThan(revocar ?? 0);
    expect(revocar).toBeLessThan(local ?? 0);
  });

  it('si el servidor falla, la sesión local sigue y se muestra el error', async () => {
    vi.mocked(bajaDePushAlCerrarSesion).mockResolvedValue();
    vi.mocked(cerrarSesionesEnTodosLosDispositivos).mockRejectedValue(
      new ApiError(500, 'Error interno del servidor'),
    );
    const { usuario, dialogo } = await abrir();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cerrar todas las sesiones' }));

    expect(await within(dialogo).findByRole('alert')).toBeInTheDocument();
    expect(cerrarSesion).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
