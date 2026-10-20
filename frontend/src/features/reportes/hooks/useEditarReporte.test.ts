import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { listarCategorias } from '@/lib/api/catalogos';
import { ApiError } from '@/lib/api/errors';
import { cancelarReporte, editarReporte } from '../api';
import type { ReporteResumen } from '../model/tipos';
import { useEditarReporte } from './useEditarReporte';

vi.mock('../api', () => ({ editarReporte: vi.fn(), cancelarReporte: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ listarCategorias: vi.fn() }));

// Reporte con una categoría personalizada que la municipalidad desactivó.
const REPORTE: ReporteResumen = {
  id: 9,
  estado: 'PENDIENTE',
  categoriaId: 58,
  categoriaNombre: 'Ciclovia obstruida',
  descripcion: 'Conos',
  distritoId: 15,
};

beforeEach(() => {
  vi.mocked(listarCategorias).mockResolvedValue([{ id: 1, nombre: 'Bache', esEstandar: true }]);
});

afterEach(() => {
  vi.mocked(listarCategorias).mockReset();
  vi.mocked(editarReporte).mockReset();
  vi.mocked(cancelarReporte).mockReset();
});

describe('useEditarReporte (US-08 + US-29)', () => {
  it('ofrece las categorías del distrito y conserva la desactivada del reporte', async () => {
    const { result } = renderHook(() => useEditarReporte(REPORTE));

    await waitFor(() => expect(result.current.opciones).toHaveLength(2));
    expect(listarCategorias).toHaveBeenCalledWith(15);
    expect(result.current.opciones[0]).toEqual({
      id: 58,
      nombre: 'Ciclovia obstruida',
      noOfrecida: true,
    });
  });

  it('si el catálogo falla, ofrece solo la categoría actual sin marcarla', async () => {
    vi.mocked(listarCategorias).mockRejectedValue(new ApiError(500, 'Fallo'));
    const { result } = renderHook(() => useEditarReporte(REPORTE));
    await waitFor(() => expect(listarCategorias).toHaveBeenCalled());
    expect(result.current.opciones).toEqual([
      { id: 58, nombre: 'Ciclovia obstruida', noOfrecida: false },
    ]);
  });

  it('guardar no reenvía la categoría si no cambió', async () => {
    vi.mocked(editarReporte).mockResolvedValue(REPORTE);
    const { result } = renderHook(() => useEditarReporte(REPORTE));

    let ok = false;
    await act(async () => {
      ok = await result.current.guardar(58, 'Conos en la ciclovía');
    });

    expect(ok).toBe(true);
    expect(editarReporte).toHaveBeenCalledWith(9, { descripcion: 'Conos en la ciclovía' });
  });

  it('guardar envía la categoría elegida si es otra', async () => {
    vi.mocked(editarReporte).mockResolvedValue(REPORTE);
    const { result } = renderHook(() => useEditarReporte(REPORTE));
    await act(async () => {
      await result.current.guardar(1, 'Conos');
    });
    expect(editarReporte).toHaveBeenCalledWith(9, { categoriaId: 1, descripcion: 'Conos' });
  });

  it('el 409 (ya no está PENDIENTE) llega con su mensaje', async () => {
    vi.mocked(cancelarReporte).mockRejectedValue(new ApiError(409, 'El reporte ya no está pendiente'));
    const { result } = renderHook(() => useEditarReporte(REPORTE));

    let ok = true;
    await act(async () => {
      ok = await result.current.retirar();
    });

    expect(ok).toBe(false);
    expect(cancelarReporte).toHaveBeenCalledWith(9);
    expect(result.current.error?.mensaje).toBe('El reporte ya no está pendiente');
    expect(result.current.enviando).toBe(false);
  });

  it('retirar devuelve true cuando el backend lo cancela', async () => {
    vi.mocked(cancelarReporte).mockResolvedValue({ ...REPORTE, estado: 'CANCELADO' });
    const { result } = renderHook(() => useEditarReporte(REPORTE));
    let ok = false;
    await act(async () => {
      ok = await result.current.retirar();
    });
    expect(ok).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
