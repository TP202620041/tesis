import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { PushEnEsteNavegador } from '../components/PushEnEsteNavegador';
import type { Consentimientos } from '../model/consentimientos';
import type { EstadoPush } from '../model/push';
import { activarPush, desactivarPush, estadoDePush, reRegistrarPushAlIniciarSesion } from './push';
import type { EstadoConsentimientos } from './useConsentimientos';
import { usePushEnEsteNavegador } from './usePushEnEsteNavegador';

vi.mock('./push', () => ({
  activarPush: vi.fn(),
  desactivarPush: vi.fn(),
  estadoDePush: vi.fn(),
  reRegistrarPushAlIniciarSesion: vi.fn(),
}));

afterEach(() => {
  vi.mocked(activarPush).mockReset();
  vi.mocked(desactivarPush).mockReset();
  vi.mocked(estadoDePush).mockReset();
  vi.mocked(reRegistrarPushAlIniciarSesion).mockReset();
});

function consentimientos(conPush: boolean, otorgado = true): EstadoConsentimientos {
  const datos: Consentimientos = {
    versionTerminosVigente: '2026-10-v1',
    debeAceptarTerminos: false,
    vigentes: conPush
      ? [
          {
            id: 1,
            finalidad: 'NOTIFICACIONES_PUSH',
            versionDocumento: 'push-2026-10-v1',
            aceptadoEn: '2026-10-20T00:00:00Z',
            revocadoEn: null,
            vigente: true,
          },
        ]
      : [],
    historial: [],
  };
  return {
    carga: { estado: 'listo', datos, error: null, recargar: vi.fn(), recargando: false },
    procesando: null,
    error: null,
    otorgar: vi.fn().mockResolvedValue(otorgado),
    revocar: vi.fn().mockResolvedValue(true),
  };
}

async function montar(c: EstadoConsentimientos, inicial: EstadoPush) {
  vi.mocked(estadoDePush).mockResolvedValue(inicial);
  const hook = renderHook(() => usePushEnEsteNavegador(c));
  await waitFor(() => expect(hook.result.current.estado).toBe(inicial));
  return hook;
}

describe('usePushEnEsteNavegador', () => {
  it('sin consentimiento, «activar» lo otorga primero y después activa', async () => {
    const c = consentimientos(false);
    vi.mocked(activarPush).mockResolvedValue('activo');
    const { result } = await montar(c, 'inactivo');

    await act(async () => {
      await result.current.activar();
    });

    expect(c.otorgar).toHaveBeenCalledWith('NOTIFICACIONES_PUSH');
    expect(activarPush).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe('activo');
  });

  it('si otorgar el consentimiento falla, no toca el navegador', async () => {
    const c = consentimientos(false, false);
    const { result } = await montar(c, 'inactivo');
    await act(async () => {
      await result.current.activar();
    });
    expect(activarPush).not.toHaveBeenCalled();
  });

  it('un 409 al registrar se explica como falta de consentimiento', async () => {
    vi.mocked(activarPush).mockRejectedValue(new ApiError(409, 'Falta consentimiento'));
    const { result } = await montar(consentimientos(true), 'inactivo');
    await act(async () => {
      await result.current.activar();
    });
    expect(result.current.error?.mensaje).toMatch(/consentimiento/);
  });

  it('retirar el consentimiento revoca y cancela solo la suscripción local', async () => {
    const c = consentimientos(true);
    vi.mocked(desactivarPush).mockResolvedValue('inactivo');
    const { result } = await montar(c, 'activo');

    await act(async () => {
      await result.current.retirarConsentimiento();
    });

    expect(c.revocar).toHaveBeenCalledWith('NOTIFICACIONES_PUSH');
    expect(desactivarPush).toHaveBeenCalledWith({ soloLocal: true });
    expect(result.current.estado).toBe('inactivo');
  });

  it('con consentimiento y una suscripción ya presente, la vuelve a registrar al cargar', async () => {
    await montar(consentimientos(true), 'activo');
    await waitFor(() => expect(reRegistrarPushAlIniciarSesion).toHaveBeenCalledTimes(1));
  });

  it('sin consentimiento no registra nada al cargar', async () => {
    await montar(consentimientos(false), 'activo');
    expect(reRegistrarPushAlIniciarSesion).not.toHaveBeenCalled();
  });
});

describe('PushEnEsteNavegador', () => {
  function estado(over: Partial<ReturnType<typeof usePushEnEsteNavegador>>) {
    return {
      estado: 'inactivo' as EstadoPush | null,
      consentido: true,
      procesando: false,
      error: null,
      activar: vi.fn(),
      desactivar: vi.fn(),
      retirarConsentimiento: vi.fn(),
      ...over,
    };
  }

  it.each([
    ['no-soportado', /no admite/],
    ['sin-claves', /no están disponibles/],
    ['denegado', /Bloqueaste/],
  ] as const)('en estado %s solo explica, sin botones', (e, texto) => {
    render(<PushEnEsteNavegador push={estado({ estado: e })} />);
    expect(screen.getByText(texto)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('inactivo con consentimiento ofrece activar aquí', async () => {
    const push = estado({});
    render(<PushEnEsteNavegador push={push} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Activar notificaciones push aquí' }));
    expect(push.activar).toHaveBeenCalledTimes(1);
  });

  it('sin consentimiento ofrece otorgarlo y activar', () => {
    render(<PushEnEsteNavegador push={estado({ consentido: false })} />);
    expect(screen.getByRole('button', { name: 'Otorgar consentimiento y activar aquí' })).toBeInTheDocument();
  });

  it('activo ofrece desactivar solo este navegador', async () => {
    const push = estado({ estado: 'activo' });
    render(<PushEnEsteNavegador push={push} />);
    expect(screen.getByText(/están activas en este navegador/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Desactivar en este navegador' }));
    expect(push.desactivar).toHaveBeenCalledTimes(1);
  });
});
