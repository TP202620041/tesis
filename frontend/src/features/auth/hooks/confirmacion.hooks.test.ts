import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { confirmarCorreo, iniciarSesion, reenviarConfirmacion, registrar } from '../api';
import { MENSAJE_ENLACE_INVALIDO } from '../model/confirmacion';
import { useConfirmacionDeCorreo } from './useConfirmacionDeCorreo';
import { useIniciarSesion } from './useIniciarSesion';
import { useReenvioDeConfirmacion } from './useReenvioDeConfirmacion';
import { useRegistro } from './useRegistro';

vi.mock('../api', () => ({
  confirmarCorreo: vi.fn(),
  reenviarConfirmacion: vi.fn(),
  iniciarSesion: vi.fn(),
  registrar: vi.fn(),
}));
vi.mock('./push', () => ({ reRegistrarPushAlIniciarSesion: vi.fn() }));

const confirmar = vi.mocked(confirmarCorreo);
const reenviar = vi.mocked(reenviarConfirmacion);

const TOKEN = '3q2-7w_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ';
const VENCIDO = 'El enlace de confirmación venció. Pide uno nuevo desde el inicio de sesión.';

function irA(url: string) {
  window.history.replaceState(null, '', url);
}

afterEach(() => {
  vi.mocked(confirmarCorreo).mockReset();
  vi.mocked(reenviarConfirmacion).mockReset();
  vi.mocked(iniciarSesion).mockReset();
  vi.mocked(registrar).mockReset();
  vi.useRealTimers();
  irA('/');
});

describe('useConfirmacionDeCorreo (NC-09)', () => {
  beforeEach(() => irA(`/confirmar-cuenta?token=${TOKEN}`));

  it('confirma con el token y saca el token de la URL antes de llamar al API', async () => {
    let urlAlLlamar = '';
    confirmar.mockImplementation(async () => {
      urlAlLlamar = window.location.href;
    });
    const { result } = renderHook(() => useConfirmacionDeCorreo(TOKEN));

    expect(result.current.estado).toBe('confirmando');
    await waitFor(() => expect(result.current.estado).toBe('confirmado'));
    expect(confirmar).toHaveBeenCalledWith(TOKEN);
    // Ni en el historial ni en el Referer de la petición.
    expect(urlAlLlamar).not.toContain(TOKEN);
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/confirmar-cuenta');
    expect(result.current.mensaje).toBeNull();
  });

  it('llama una sola vez aunque StrictMode monte el efecto dos veces', async () => {
    confirmar.mockResolvedValue(undefined);
    const { result } = renderHook(() => useConfirmacionDeCorreo(TOKEN), { wrapper: StrictMode });

    await waitFor(() => expect(result.current.estado).toBe('confirmado'));
    expect(confirmar).toHaveBeenCalledTimes(1);
  });

  it('el token se toma una vez: que la URL ya no lo traiga no cambia nada', async () => {
    confirmar.mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ token }) => useConfirmacionDeCorreo(token), {
      initialProps: { token: TOKEN as string | null },
    });
    rerender({ token: null });

    await waitFor(() => expect(result.current.estado).toBe('confirmado'));
    expect(confirmar).toHaveBeenCalledTimes(1);
  });

  it('409 CORREO_YA_CONFIRMADO cuenta como éxito', async () => {
    confirmar.mockRejectedValue(
      new ApiError(409, 'Tu correo ya está confirmado. Inicia sesión con tu contraseña.', '', [], 'CORREO_YA_CONFIRMADO'),
    );
    const { result } = renderHook(() => useConfirmacionDeCorreo(TOKEN));

    await waitFor(() => expect(result.current.estado).toBe('confirmado'));
    expect(result.current.mensaje).toBeNull();
  });

  it.each([
    ['CONFIRMACION_VENCIDA', 'vencido', VENCIDO],
    [
      'CONFIRMACION_REEMPLAZADA',
      'reemplazado',
      'Este enlace ya no sirve porque pediste uno nuevo. Usa el del último correo que te enviamos.',
    ],
    ['CONFIRMACION_INVALIDA', 'invalido', MENSAJE_ENLACE_INVALIDO],
  ])('409 %s → %s, con el mensaje del backend', async (codigo, estado, mensaje) => {
    confirmar.mockRejectedValue(new ApiError(409, mensaje, '', [], codigo));
    const { result } = renderHook(() => useConfirmacionDeCorreo(TOKEN));

    await waitFor(() => expect(result.current.estado).toBe(estado));
    expect(result.current.mensaje).toBe(mensaje);
  });

  it('sin token, o con uno de más de 100 caracteres, es inválido sin llamar al API', () => {
    irA('/confirmar-cuenta');
    const { result } = renderHook(() => useConfirmacionDeCorreo(null));
    expect(result.current.estado).toBe('invalido');
    expect(result.current.mensaje).toBe(MENSAJE_ENLACE_INVALIDO);

    irA(`/confirmar-cuenta?token=${'a'.repeat(101)}`);
    const largo = renderHook(() => useConfirmacionDeCorreo('a'.repeat(101)));
    expect(largo.result.current.estado).toBe('invalido');
    // También se saca de la URL.
    expect(window.location.search).toBe('');
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('un 400 del backend se muestra como enlace inválido, no como «Error de validación»', async () => {
    confirmar.mockRejectedValue(new ApiError(400, 'Error de validación', '', ['Falta el código del enlace de confirmación']));
    const { result } = renderHook(() => useConfirmacionDeCorreo(TOKEN));

    await waitFor(() => expect(result.current.estado).toBe('invalido'));
    expect(result.current.mensaje).toBe(MENSAJE_ENLACE_INVALIDO);
  });

  it('sin red queda en error y reintentar vuelve a llamar con el mismo token', async () => {
    confirmar.mockRejectedValueOnce(new NetworkError());
    const { result } = renderHook(() => useConfirmacionDeCorreo(TOKEN));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.mensaje).toBe('Sin conexión con el servidor. Revisa tu red.');

    confirmar.mockResolvedValueOnce(undefined);
    act(() => result.current.reintentar());
    expect(result.current.estado).toBe('confirmando');

    await waitFor(() => expect(result.current.estado).toBe('confirmado'));
    expect(confirmar).toHaveBeenCalledTimes(2);
    expect(confirmar).toHaveBeenLastCalledWith(TOKEN);
  });
});

describe('useReenvioDeConfirmacion (NC-09)', () => {
  it('envía el correo limpio y muestra el aviso neutro', async () => {
    reenviar.mockResolvedValue(undefined);
    const { result } = renderHook(() => useReenvioDeConfirmacion());

    let ok = false;
    await act(async () => {
      ok = await result.current.reenviar('  ana@lima.pe ');
    });

    expect(ok).toBe(true);
    expect(reenviar).toHaveBeenCalledWith('ana@lima.pe');
    expect(result.current.enviado).toBe(true);
    expect(result.current.segundosRestantes).toBe(60);
  });

  it('espera 60 s entre envíos y después deja volver a pedir', async () => {
    vi.useFakeTimers();
    reenviar.mockResolvedValue(undefined);
    const { result } = renderHook(() => useReenvioDeConfirmacion());
    await act(async () => {
      await result.current.reenviar('ana@lima.pe');
    });

    // Durante la espera no se llama al API (el backend tampoco enviaría).
    await act(async () => {
      expect(await result.current.reenviar('ana@lima.pe')).toBe(false);
    });
    expect(reenviar).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.segundosRestantes).toBe(30);
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.segundosRestantes).toBe(0);

    await act(async () => {
      await result.current.reenviar('ana@lima.pe');
    });
    expect(reenviar).toHaveBeenCalledTimes(2);
  });

  it('recién registrado, el primer reenvío también espera (el del registro cuenta)', () => {
    const { result } = renderHook(() => useReenvioDeConfirmacion({ recienEnviado: true }));
    expect(result.current.segundosRestantes).toBe(60);
  });

  it('sin correo no llama al API', async () => {
    const { result } = renderHook(() => useReenvioDeConfirmacion());
    await act(async () => {
      await result.current.reenviar('   ');
    });
    expect(reenviar).not.toHaveBeenCalled();
    expect(result.current.error?.mensaje).toMatch(/correo con el que creaste la cuenta/);
  });

  it('un 400 o la falta de red se muestran y no inician la espera', async () => {
    reenviar.mockRejectedValue(new ApiError(400, 'Error de validación', '', ['El correo no tiene un formato válido']));
    const { result } = renderHook(() => useReenvioDeConfirmacion());
    await act(async () => {
      await result.current.reenviar('no-es-correo');
    });

    expect(result.current.error).toEqual({
      mensaje: 'Error de validación',
      detalles: ['El correo no tiene un formato válido'],
    });
    expect(result.current.enviado).toBe(false);
    expect(result.current.segundosRestantes).toBe(0);
  });
});

describe('useIniciarSesion con la cuenta sin confirmar (NC-09)', () => {
  const MENSAJE =
    'Confirma tu correo para iniciar sesión. Te enviamos un enlace al registrarte; si no lo encuentras, revisa la carpeta de spam o pide uno nuevo.';

  it('el 409 CORREO_NO_CONFIRMADO deja el mensaje y el correo con el que se intentó', async () => {
    vi.mocked(iniciarSesion).mockRejectedValue(new ApiError(409, MENSAJE, '', [], 'CORREO_NO_CONFIRMADO'));
    const { result } = renderHook(() => useIniciarSesion());

    await act(async () => {
      expect(await result.current.enviar({ email: ' ana@lima.pe ', password: 'secreta123' })).toBeNull();
    });

    expect(result.current.correoSinConfirmar).toBe('ana@lima.pe');
    expect(result.current.error?.mensaje).toBe(MENSAJE);
  });

  it('el 401 de credenciales no ofrece reenviar', async () => {
    vi.mocked(iniciarSesion).mockRejectedValue(new ApiError(401, 'Credenciales invalidas'));
    const { result } = renderHook(() => useIniciarSesion());
    await act(async () => {
      await result.current.enviar({ email: 'ana@lima.pe', password: 'otra' });
    });

    expect(result.current.correoSinConfirmar).toBeNull();
    expect(result.current.error?.mensaje).toBe('Credenciales invalidas');
  });
});

describe('useRegistro con el dominio del correo rechazado (NC-09)', () => {
  const DATOS = { nombre: 'Ana', apellido: 'Ruiz', email: 'ana@gmail.con', password: 'secreta123' };

  it.each(['CORREO_DESECHABLE', 'DOMINIO_SIN_CORREO'])('el 409 %s va al campo del correo, no al error general', async (codigo) => {
    const mensaje = 'El dominio «gmail.con» no puede recibir correos. Revisa que esté bien escrito o usa otra dirección.';
    vi.mocked(registrar).mockRejectedValue(new ApiError(409, mensaje, '', [], codigo));
    const { result } = renderHook(() => useRegistro());

    let resultado: unknown;
    await act(async () => {
      resultado = await result.current.enviar(DATOS);
    });

    expect(resultado).toEqual({ cuenta: null, terminosDesactualizados: false });
    expect(result.current.errorDelCorreo).toBe(mensaje);
    expect(result.current.error).toBeNull();
  });

  it('el siguiente intento limpia el error del correo', async () => {
    vi.mocked(registrar).mockRejectedValueOnce(new ApiError(409, 'No aceptamos correos temporales', '', [], 'CORREO_DESECHABLE'));
    vi.mocked(registrar).mockResolvedValueOnce({ email: 'ana@lima.pe', vigenciaEnlaceHoras: 24 });
    const { result } = renderHook(() => useRegistro());
    await act(async () => {
      await result.current.enviar(DATOS);
    });
    await act(async () => {
      await result.current.enviar({ ...DATOS, email: 'ana@lima.pe' });
    });

    expect(result.current.errorDelCorreo).toBeNull();
  });
});
