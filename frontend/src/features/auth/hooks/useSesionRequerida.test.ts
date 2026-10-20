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

  function conUsuario(debeAceptarTerminos: boolean) {
    sesion.mockReturnValue({
      estado: 'autenticado',
      usuario: {
        id: 1,
        email: 'ana@lima.pe',
        nombre: 'Ana',
        apellido: 'Vecina',
        rol: 'CIUDADANO',
        preferenciaNotificacion: 'EMAIL',
        debeAceptarTerminos,
      },
      refrescar: vi.fn(),
    });
  }

  it('con sesion devuelve el usuario y no redirige', () => {
    conUsuario(false);
    const { result } = renderHook(() => useSesionRequerida('/login'));

    expect(result.current.estado).toBe('autenticado');
    expect(replace).not.toHaveBeenCalled();
  });

  it('con los términos pendientes lleva a aceptarlos y vuelve aquí (NC-07b)', () => {
    conUsuario(true);
    window.history.replaceState(null, '', '/reportar?x=1');
    const { result } = renderHook(() => useSesionRequerida('/login'));

    expect(result.current.estado).toBe('cargando');
    expect(replace).toHaveBeenCalledWith('/aceptar-terminos?redirect=%2Freportar%3Fx%3D1');
  });

  it('en la propia pantalla de aceptación no redirige (sin bucle)', () => {
    conUsuario(true);
    window.history.replaceState(null, '', '/aceptar-terminos?redirect=%2Freportar');
    const { result } = renderHook(() => useSesionRequerida('/login'));

    expect(result.current.estado).toBe('autenticado');
    expect(replace).not.toHaveBeenCalled();
  });
});
