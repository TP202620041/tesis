import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSesion } from './useSesion';
import { useSesionRequerida } from './useSesionRequerida';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('./useSesion', () => ({ useSesion: vi.fn() }));

const sesion = vi.mocked(useSesion);

afterEach(() => {
  replace.mockReset();
  sesion.mockReset();
});

describe('useSesionRequerida', () => {
  it('sin sesion redirige al destino', () => {
    sesion.mockReturnValue({ estado: 'anonimo', refrescar: vi.fn() });
    const { result } = renderHook(() => useSesionRequerida('/login?redirect=/reportar'));

    expect(result.current.estado).toBe('anonimo');
    expect(replace).toHaveBeenCalledWith('/login?redirect=/reportar');
  });

  it('mientras carga no redirige', () => {
    sesion.mockReturnValue({ estado: 'cargando', refrescar: vi.fn() });
    renderHook(() => useSesionRequerida('/login'));

    expect(replace).not.toHaveBeenCalled();
  });

  it('con sesion devuelve el usuario y no redirige', () => {
    sesion.mockReturnValue({
      estado: 'autenticado',
      usuario: {
        id: 1,
        email: 'ana@lima.pe',
        nombre: 'Ana',
        apellido: 'Vecina',
        rol: 'CIUDADANO',
        preferenciaNotificacion: 'EMAIL',
      },
      refrescar: vi.fn(),
    });
    const { result } = renderHook(() => useSesionRequerida('/login'));

    expect(result.current.estado).toBe('autenticado');
    expect(replace).not.toHaveBeenCalled();
  });
});
