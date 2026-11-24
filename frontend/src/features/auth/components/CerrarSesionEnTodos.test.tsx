import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { CerrarSesionEnTodos } from './CerrarSesionEnTodos';
import { cerrarSesion, cerrarSesionesEnTodosLosDispositivos } from '../api';
import {
  activarPush,
  bajaDePushAlCerrarSesion,
  restablecerPushTrasCierreFallido,
} from '../hooks/push';

const replace = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../api', () => ({ cerrarSesion: vi.fn(), cerrarSesionesEnTodosLosDispositivos: vi.fn() }));
vi.mock('../hooks/push', () => ({
  activarPush: vi.fn(),
  bajaDePushAlCerrarSesion: vi.fn(),
  restablecerPushTrasCierreFallido: vi.fn(),
}));

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
  vi.mocked(restablecerPushTrasCierreFallido).mockReset();
  vi.mocked(activarPush).mockReset();
});

const NOMBRE_DIALOGO = '¿Cerrar sesión en todos los dispositivos?';
const AVISO_PUSH = 'Notificaciones desactivadas en este dispositivo';

async function abrir() {
  const usuario = userEvent.setup();
  render(<CerrarSesionEnTodos />);
  await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión en todos los dispositivos' }));
  return { usuario, dialogo: screen.getByRole('dialog', { name: NOMBRE_DIALOGO }) };
}

async function confirmarConFallo(habiaPush: boolean, restablecido: boolean) {
  vi.mocked(bajaDePushAlCerrarSesion).mockResolvedValue(habiaPush);
  vi.mocked(restablecerPushTrasCierreFallido).mockResolvedValue(restablecido);
  vi.mocked(cerrarSesionesEnTodosLosDispositivos).mockRejectedValue(
    new ApiError(500, 'Error interno del servidor'),
  );
  const abierto = await abrir();
  await abierto.usuario.click(
    within(abierto.dialogo).getByRole('button', { name: 'Cerrar todas las sesiones' }),
  );
  await within(abierto.dialogo).findByRole('alert');
  return abierto;
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
    vi.mocked(bajaDePushAlCerrarSesion).mockResolvedValue(true);
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
    expect(restablecerPushTrasCierreFallido).not.toHaveBeenCalled();
  });

  it('un 401 no es un fallo: el token ya no vale y se cierra la sesión local', async () => {
    vi.mocked(bajaDePushAlCerrarSesion).mockResolvedValue(false);
    vi.mocked(cerrarSesionesEnTodosLosDispositivos).mockRejectedValue(new ApiError(401, 'Sesión expirada'));
    const { usuario, dialogo } = await abrir();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cerrar todas las sesiones' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it('si el servidor falla, la sesión local sigue, se puede reintentar y el push se restablece solo', async () => {
    const { dialogo } = await confirmarConFallo(true, true);

    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Tu sesión sigue abierta');
    expect(cerrarSesion).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(restablecerPushTrasCierreFallido).toHaveBeenCalledTimes(1);
    expect(within(dialogo).getByText('Las notificaciones de este dispositivo siguen activas.')).toBeInTheDocument();
    expect(within(dialogo).queryByText(AVISO_PUSH)).toBeNull();
  });

  it('si el push no se pudo restablecer, lo dice y ofrece reactivarlo', async () => {
    vi.mocked(activarPush).mockResolvedValue('activo');
    const { usuario, dialogo } = await confirmarConFallo(true, false);

    expect(within(dialogo).getByText(AVISO_PUSH)).toBeInTheDocument();
    await usuario.click(
      within(dialogo).getByRole('button', { name: 'Volver a activar las notificaciones' }),
    );

    expect(activarPush).toHaveBeenCalledTimes(1);
    expect(
      await within(dialogo).findByText('Las notificaciones de este dispositivo siguen activas.'),
    ).toBeInTheDocument();
    expect(within(dialogo).queryByText(AVISO_PUSH)).toBeNull();
  });

  it('si reactivar también falla, remite al perfil', async () => {
    vi.mocked(activarPush).mockRejectedValue(new ApiError(409, 'Falta el consentimiento'));
    const { usuario, dialogo } = await confirmarConFallo(true, false);

    await usuario.click(
      within(dialogo).getByRole('button', { name: 'Volver a activar las notificaciones' }),
    );

    expect(await within(dialogo).findByText(/No se pudieron reactivar/)).toBeInTheDocument();
  });

  it('sin push previo no habla de notificaciones', async () => {
    const { dialogo } = await confirmarConFallo(false, false);
    expect(restablecerPushTrasCierreFallido).not.toHaveBeenCalled();
    expect(within(dialogo).queryByText(AVISO_PUSH)).toBeNull();
    expect(within(dialogo).queryByText(/siguen activas/)).toBeNull();
  });
});
