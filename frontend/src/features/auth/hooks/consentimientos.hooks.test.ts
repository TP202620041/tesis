import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { aceptarConsentimiento, obtenerConsentimientos, registrar, revocarConsentimiento } from '../api';
import type { Consentimientos } from '../model/consentimientos';
import { VERSION_AVISO_CORREO, VERSION_AVISO_PUSH } from '../model/consentimientos';
import { VERSION_TERMINOS } from '../model/terminos';
import { useAceptarTerminos } from './useAceptarTerminos';
import { useConsentimientos } from './useConsentimientos';
import { useRegistro } from './useRegistro';

vi.mock('../api', () => ({
  aceptarConsentimiento: vi.fn(),
  obtenerConsentimientos: vi.fn(),
  revocarConsentimiento: vi.fn(),
  registrar: vi.fn(),
}));

const PENDIENTES: Consentimientos = {
  versionTerminosVigente: '2026-10-v1',
  debeAceptarTerminos: true,
  vigentes: [],
  historial: [],
};

afterEach(() => {
  vi.mocked(aceptarConsentimiento).mockReset();
  vi.mocked(obtenerConsentimientos).mockReset();
  vi.mocked(revocarConsentimiento).mockReset();
  vi.mocked(registrar).mockReset();
});

describe('useRegistro (US-01 + NC-07b)', () => {
  const DATOS = { nombre: 'Ana', apellido: 'Ruiz', email: 'ana@lima.pe', password: 'secreta123' };

  it('envía la aceptación con la versión de los términos que muestra la app y devuelve la sesión', async () => {
    const sesion = { token: 't' } as never;
    vi.mocked(registrar).mockResolvedValue(sesion);
    const { result } = renderHook(() => useRegistro());

    let resultado: unknown = 'sin llamar';
    await act(async () => {
      resultado = await result.current.enviar(DATOS);
    });

    expect(registrar).toHaveBeenCalledWith({
      ...DATOS,
      aceptaTerminos: true,
      versionTerminos: VERSION_TERMINOS,
    });
    expect(resultado).toEqual({ sesion, terminosDesactualizados: false });
  });

  it('un 409 por versión no vigente marca los términos como desactualizados, también en el resultado', async () => {
    vi.mocked(registrar).mockRejectedValue(
      new ApiError(409, 'La version de los terminos aceptada no es la vigente (2026-11-v2): vuelve a leerlos y aceptalos'),
    );
    const { result } = renderHook(() => useRegistro());

    let resultado: unknown = 'sin llamar';
    await act(async () => {
      resultado = await result.current.enviar(DATOS);
    });

    // QA-1 M-2: quien envía lo sabe en el mismo momento (el estado del hook
    // llega en el render siguiente) y solo entonces desmarca la casilla.
    expect(resultado).toEqual({ sesion: null, terminosDesactualizados: true });
    expect(result.current.terminosDesactualizados).toBe(true);
    expect(result.current.error?.mensaje).toMatch(/no es la vigente/);
  });

  it('el 409 de correo repetido no se confunde con el de términos', async () => {
    vi.mocked(registrar).mockRejectedValue(new ApiError(409, 'El email ya esta registrado'));
    const { result } = renderHook(() => useRegistro());
    let resultado: unknown = 'sin llamar';
    await act(async () => {
      resultado = await result.current.enviar(DATOS);
    });
    expect(resultado).toEqual({ sesion: null, terminosDesactualizados: false });
    expect(result.current.terminosDesactualizados).toBe(false);
  });
});

describe('useConsentimientos', () => {
  it('otorgar envía la versión del texto del aviso y recarga', async () => {
    vi.mocked(obtenerConsentimientos).mockResolvedValue({ ...PENDIENTES, debeAceptarTerminos: false });
    vi.mocked(aceptarConsentimiento).mockResolvedValue();
    const { result } = renderHook(() => useConsentimientos());
    await waitFor(() => expect(result.current.carga.estado).toBe('listo'));

    await act(async () => {
      await result.current.otorgar('NOTIFICACIONES_PUSH');
    });
    await waitFor(() => expect(obtenerConsentimientos).toHaveBeenCalledTimes(2));
    await act(async () => {
      await result.current.otorgar('NOTIFICACIONES_CORREO');
    });

    expect(aceptarConsentimiento).toHaveBeenNthCalledWith(1, 'NOTIFICACIONES_PUSH', VERSION_AVISO_PUSH);
    expect(aceptarConsentimiento).toHaveBeenNthCalledWith(2, 'NOTIFICACIONES_CORREO', VERSION_AVISO_CORREO);
    await waitFor(() => expect(obtenerConsentimientos).toHaveBeenCalledTimes(3));
  });

  it('revocar que falla deja el error y devuelve false', async () => {
    vi.mocked(obtenerConsentimientos).mockResolvedValue(PENDIENTES);
    vi.mocked(revocarConsentimiento).mockRejectedValue(new ApiError(409, 'No se puede'));
    const { result } = renderHook(() => useConsentimientos());

    let ok = true;
    await act(async () => {
      ok = await result.current.revocar('NOTIFICACIONES_CORREO');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toEqual({ mensaje: 'No se puede', detalles: [] });
    expect(result.current.procesando).toBeNull();
  });
});

describe('useAceptarTerminos (D-12)', () => {
  it('acepta los términos con la versión del API y después los avisos elegidos', async () => {
    vi.mocked(obtenerConsentimientos).mockResolvedValue(PENDIENTES);
    vi.mocked(aceptarConsentimiento).mockResolvedValue();
    const { result } = renderHook(() => useAceptarTerminos());
    await waitFor(() => expect(result.current.version).toBe('2026-10-v1'));

    let resultado: unknown;
    await act(async () => {
      resultado = await result.current.aceptar(['NOTIFICACIONES_CORREO']);
    });

    expect(resultado).toEqual({ avisosFallidos: [] });
    expect(vi.mocked(aceptarConsentimiento).mock.calls).toEqual([
      ['TERMINOS_Y_PRIVACIDAD', '2026-10-v1'],
      ['NOTIFICACIONES_CORREO', VERSION_AVISO_CORREO],
    ]);
  });

  it('si los términos fallan no guarda ningún aviso', async () => {
    vi.mocked(obtenerConsentimientos).mockResolvedValue(PENDIENTES);
    vi.mocked(aceptarConsentimiento).mockRejectedValue(new ApiError(409, 'Version no vigente'));
    const { result } = renderHook(() => useAceptarTerminos());
    await waitFor(() => expect(result.current.version).not.toBeNull());

    let resultado: unknown = 'sin llamar';
    await act(async () => {
      resultado = await result.current.aceptar(['NOTIFICACIONES_PUSH']);
    });

    expect(resultado).toBeNull();
    expect(aceptarConsentimiento).toHaveBeenCalledTimes(1);
    expect(result.current.error?.mensaje).toBe('Version no vigente');
  });

  it('un aviso que falla no deshace los términos: se informa', async () => {
    vi.mocked(obtenerConsentimientos).mockResolvedValue(PENDIENTES);
    vi.mocked(aceptarConsentimiento).mockImplementation(async (finalidad) => {
      if (finalidad === 'NOTIFICACIONES_PUSH') throw new ApiError(500, 'Error');
    });
    const { result } = renderHook(() => useAceptarTerminos());
    await waitFor(() => expect(result.current.version).not.toBeNull());

    let resultado: unknown;
    await act(async () => {
      resultado = await result.current.aceptar(['NOTIFICACIONES_CORREO', 'NOTIFICACIONES_PUSH']);
    });

    expect(resultado).toEqual({ avisosFallidos: ['NOTIFICACIONES_PUSH'] });
    expect(aceptarConsentimiento).toHaveBeenCalledTimes(3);
  });
});
