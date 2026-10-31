import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, NetworkError } from '@/lib/api/errors';
import {
  desestimarDenuncias,
  detalleDeModeracion,
  historialDeModeracion,
  ocultarContenido,
  restablecerContenido,
} from '../api';
import type { ReporteEnModeracion } from '../model/tipos';
import { useDetalleModeracion } from './useDetalleModeracion';

vi.mock('../api', () => ({
  detalleDeModeracion: vi.fn(),
  historialDeModeracion: vi.fn(),
  ocultarContenido: vi.fn(),
  restablecerContenido: vi.fn(),
  desestimarDenuncias: vi.fn(),
}));

afterEach(() => {
  vi.mocked(detalleDeModeracion).mockReset();
  vi.mocked(historialDeModeracion).mockReset();
  vi.mocked(ocultarContenido).mockReset();
  vi.mocked(restablecerContenido).mockReset();
  vi.mocked(desestimarDenuncias).mockReset();
});

const REPORTE = { id: 42, titulo: 'Bache', oculto: false, fotoOculta: false, tieneFoto: true, denuncias: [] } as unknown as ReporteEnModeracion;
const OCULTO = { ...REPORTE, oculto: true } as ReporteEnModeracion;
const HISTORIAL = [{ id: 1, tipoEvento: 'CAMBIO_ESTADO' }];
const ORDEN = { alcance: 'REPORTE', motivo: 'Contenido ofensivo hacia un vecino' } as const;

async function listo() {
  vi.mocked(detalleDeModeracion).mockResolvedValue(REPORTE);
  vi.mocked(historialDeModeracion).mockResolvedValue(HISTORIAL);
  const hook = renderHook(() => useDetalleModeracion(42));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return hook;
}

describe('useDetalleModeracion (NC-11b)', () => {
  it('carga el reporte y su historial juntos', async () => {
    const { result } = await listo();
    expect(result.current.datos).toEqual({ reporte: REPORTE, historial: HISTORIAL });
    expect(result.current.operacion).toBeNull();
  });

  it('un historial que falla se muestra vacío y no impide moderar', async () => {
    vi.mocked(detalleDeModeracion).mockResolvedValue(REPORTE);
    vi.mocked(historialDeModeracion).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useDetalleModeracion(42));
    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(result.current.datos?.historial).toEqual([]);
  });

  it('un 404 del detalle deja la carga en error', async () => {
    vi.mocked(detalleDeModeracion).mockRejectedValue(new ApiError(404, 'No existe'));
    vi.mocked(historialDeModeracion).mockResolvedValue([]);
    const { result } = renderHook(() => useDetalleModeracion(99));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error?.mensaje).toBe('No existe');
  });

  it('ocultar con 200 recarga el detalle (lo que quedó guardado, más la entrada del historial)', async () => {
    const { result } = await listo();
    vi.mocked(ocultarContenido).mockResolvedValue(OCULTO);
    vi.mocked(detalleDeModeracion).mockResolvedValue(OCULTO);

    let resultado;
    await act(async () => {
      resultado = await result.current.ocultar(ORDEN);
    });

    expect(resultado).toEqual({ ok: true });
    expect(ocultarContenido).toHaveBeenCalledWith(42, ORDEN);
    await waitFor(() => expect(result.current.datos?.reporte.oculto).toBe(true));
    expect(detalleDeModeracion).toHaveBeenCalledTimes(2);
    expect(result.current.operacion).toBeNull();
  });

  it('el 400 MOTIVO_IDENTIFICA_DENUNCIANTE vuelve al campo del motivo, sin recargar', async () => {
    const { result } = await listo();
    vi.mocked(restablecerContenido).mockRejectedValue(
      new ApiError(400, 'El motivo no puede incluir el correo de quien denunció', '', ['motivo'], 'MOTIVO_IDENTIFICA_DENUNCIANTE'),
    );

    let resultado;
    await act(async () => {
      resultado = await result.current.restablecer(ORDEN);
    });

    expect(resultado).toEqual({
      ok: false,
      campo: 'motivo',
      mensaje: 'El motivo no puede incluir el correo de quien denunció',
    });
    expect(detalleDeModeracion).toHaveBeenCalledTimes(1);
  });

  it.each(['YA_OCULTO', 'NO_OCULTO', 'SIN_FOTO'])(
    'el 409 %s avisa que estaba desactualizado y recarga',
    async (codigo) => {
      const { result } = await listo();
      vi.mocked(ocultarContenido).mockRejectedValue(new ApiError(409, 'El reporte ya está oculto', '', [], codigo));

      let resultado;
      await act(async () => {
        resultado = await result.current.ocultar(ORDEN);
      });

      expect(resultado).toEqual({ ok: false, campo: null, mensaje: 'El reporte ya está oculto', desactualizado: true });
      await waitFor(() => expect(detalleDeModeracion).toHaveBeenCalledTimes(2));
    },
  );

  it('desestimar pasa el motivo (opcional) y un fallo de red se traduce', async () => {
    const { result } = await listo();
    vi.mocked(desestimarDenuncias).mockResolvedValueOnce(REPORTE).mockRejectedValueOnce(new NetworkError());

    let ok;
    await act(async () => {
      ok = await result.current.desestimar('No es indebido');
    });
    expect(ok).toEqual({ ok: true });
    expect(desestimarDenuncias).toHaveBeenCalledWith(42, 'No es indebido');

    let fallo;
    await act(async () => {
      fallo = await result.current.desestimar();
    });
    expect(fallo).toEqual({
      ok: false,
      campo: null,
      mensaje: 'Sin conexión con el servidor. Revisa tu red.',
      desactualizado: false,
    });
  });
});
