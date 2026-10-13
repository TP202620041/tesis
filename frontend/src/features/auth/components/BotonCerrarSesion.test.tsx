import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotonCerrarSesion } from './BotonCerrarSesion';
import { cerrarSesion } from '../api';

const replace = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../api', () => ({ cerrarSesion: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BotonCerrarSesion', () => {
  it('descarta el token, borra la caché del API y reemplaza la ruta por el login', async () => {
    const borrarCache = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('caches', { delete: borrarCache });
    render(<BotonCerrarSesion />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(cerrarSesion).toHaveBeenCalledTimes(1);
    expect(borrarCache).toHaveBeenCalledWith('cross-origin');
    expect(replace).toHaveBeenCalledWith('/login');
    // El token se descarta antes de navegar: el login no debe ver una sesión viva.
    const [ordenCierre] = vi.mocked(cerrarSesion).mock.invocationCallOrder;
    const [ordenNavegacion] = replace.mock.invocationCallOrder;
    expect(ordenCierre).toBeLessThan(ordenNavegacion ?? 0);
  });
});
