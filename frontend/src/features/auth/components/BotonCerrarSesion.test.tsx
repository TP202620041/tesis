import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotonCerrarSesion } from './BotonCerrarSesion';
import { cerrarSesion } from '../api';
import { bajaDePushAlCerrarSesion } from '../hooks/push';

const replace = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../api', () => ({ cerrarSesion: vi.fn() }));
vi.mock('../hooks/push', () => ({ bajaDePushAlCerrarSesion: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  vi.mocked(cerrarSesion).mockReset();
  vi.mocked(bajaDePushAlCerrarSesion).mockReset();
});

describe('BotonCerrarSesion', () => {
  it('descarta el token, borra la caché del API y reemplaza la ruta por el login', async () => {
    vi.mocked(bajaDePushAlCerrarSesion).mockResolvedValue();
    const borrarCache = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('caches', { delete: borrarCache });
    render(<BotonCerrarSesion />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
    expect(borrarCache).toHaveBeenCalledWith('cross-origin');
    // El token se descarta antes de navegar: el login no debe ver una sesión viva.
    const [ordenCierre] = vi.mocked(cerrarSesion).mock.invocationCallOrder;
    const [ordenNavegacion] = replace.mock.invocationCallOrder;
    expect(ordenCierre).toBeLessThan(ordenNavegacion ?? 0);
  });

  it('US-21: da de baja el push de este navegador ANTES de descartar el token', async () => {
    let terminarBaja!: () => void;
    vi.mocked(bajaDePushAlCerrarSesion).mockReturnValue(new Promise((r) => (terminarBaja = r)));
    render(<BotonCerrarSesion />);
    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    // Mientras la baja está en curso el token sigue: el DELETE necesita la sesión.
    expect(bajaDePushAlCerrarSesion).toHaveBeenCalledTimes(1);
    expect(cerrarSesion).not.toHaveBeenCalled();
    // Un segundo clic no lanza otra baja.
    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(bajaDePushAlCerrarSesion).toHaveBeenCalledTimes(1);

    terminarBaja();
    await waitFor(() => expect(cerrarSesion).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('DIS-1: avisa a quien lo contiene (el menú) antes de empezar el cierre', async () => {
    vi.mocked(bajaDePushAlCerrarSesion).mockResolvedValue();
    const alActivar = vi.fn();
    render(<BotonCerrarSesion variante="menu" alActivar={alActivar} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(alActivar).toHaveBeenCalledTimes(1);
    const [ordenAviso] = alActivar.mock.invocationCallOrder;
    const [ordenBaja] = vi.mocked(bajaDePushAlCerrarSesion).mock.invocationCallOrder;
    expect(ordenAviso).toBeLessThan(ordenBaja ?? 0);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('si la baja de push falla, la sesión se cierra igual', async () => {
    vi.mocked(bajaDePushAlCerrarSesion).mockRejectedValue(new Error('sin red'));
    render(<BotonCerrarSesion />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(cerrarSesion).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
