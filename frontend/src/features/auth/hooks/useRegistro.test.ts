import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import type { SesionIniciada } from '@/lib/types/domain';
import { registrar } from '../api';
import { VERSION_TERMINOS } from '../model/terminos';
import { useRegistro, type ResultadoRegistro } from './useRegistro';

vi.mock('../api', () => ({ registrar: vi.fn() }));

const DATOS = { nombre: 'Ana', apellido: 'Ruiz', email: 'ana@lima.pe', password: 'secreta123' };

afterEach(() => {
  vi.mocked(registrar).mockReset();
});

async function enviar() {
  const hook = renderHook(() => useRegistro());
  let resultado!: ResultadoRegistro;
  await act(async () => {
    resultado = await hook.result.current.enviar(DATOS);
  });
  return { resultado, hook };
}

describe('useRegistro', () => {
  it('envía la aceptación con la versión que muestra la app y devuelve la sesión', async () => {
    const sesion = { token: 't', usuario: { id: 1 } } as SesionIniciada;
    vi.mocked(registrar).mockResolvedValue(sesion);
    const { resultado } = await enviar();

    expect(registrar).toHaveBeenCalledWith({ ...DATOS, aceptaTerminos: true, versionTerminos: VERSION_TERMINOS });
    expect(resultado).toEqual({ sesion, terminosDesactualizados: false });
  });

  it('QA-1 M-2: dice en el resultado si el fallo fue por términos desactualizados', async () => {
    vi.mocked(registrar).mockRejectedValue(
      new ApiError(409, 'La version de los terminos aceptada no es la vigente'),
    );
    const { resultado, hook } = await enviar();

    expect(resultado).toEqual({ sesion: null, terminosDesactualizados: true });
    expect(hook.result.current.terminosDesactualizados).toBe(true);
  });

  it('QA-1 M-2: un correo ya registrado (otro 409) no cuenta como términos desactualizados', async () => {
    vi.mocked(registrar).mockRejectedValue(new ApiError(409, 'El correo ya esta registrado'));
    const { resultado, hook } = await enviar();

    expect(resultado).toEqual({ sesion: null, terminosDesactualizados: false });
    expect(hook.result.current.error?.mensaje).toBe('El correo ya esta registrado');
  });
});
