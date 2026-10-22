import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { FILTROS_VACIOS } from '../model/bbox';
import { useEstadoDelMapaEnUrl } from './useEstadoDelMapaEnUrl';

const { parametros } = vi.hoisted(() => ({ parametros: { valor: new URLSearchParams() } }));
vi.mock('next/navigation', () => ({ useSearchParams: () => parametros.valor }));

const DISTRITOS = [{ id: 21 }, { id: 17 }];
const CATEGORIAS = [{ id: 1 }, { id: 2 }];

let replaceState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  parametros.valor = new URLSearchParams();
  replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
});

afterEach(() => {
  replaceState.mockRestore();
});

describe('useEstadoDelMapaEnUrl (QA-1 M-9)', () => {
  it('lee filtros y vista de la URL', () => {
    parametros.valor = new URLSearchParams('distrito=21&estado=RESUELTO&vista=lista');
    const { result } = renderHook(() => useEstadoDelMapaEnUrl(DISTRITOS, CATEGORIAS));

    expect(result.current.filtros).toEqual({ ...FILTROS_VACIOS, distritoId: 21, estado: 'RESUELTO' });
    expect(result.current.vista).toBe('lista');
    expect(result.current.ruta).toBe('/mapa?distrito=21&estado=RESUELTO&vista=lista');
  });

  it('escribe los cambios en la URL sin navegar (replaceState) y conserva lo demás', () => {
    parametros.valor = new URLSearchParams('vista=lista');
    const { result } = renderHook(() => useEstadoDelMapaEnUrl(DISTRITOS, CATEGORIAS));

    result.current.cambiarFiltros({ ...FILTROS_VACIOS, categoriaId: 2 });
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/mapa?categoria=2&vista=lista');

    result.current.cambiarVista('mapa');
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/mapa');
  });

  it('los filtros conservan su identidad mientras la URL no cambie (el debounce depende de ella)', () => {
    parametros.valor = new URLSearchParams('distrito=21');
    const { result, rerender } = renderHook(() => useEstadoDelMapaEnUrl([...DISTRITOS], [...CATEGORIAS]));
    const antes = result.current.filtros;
    rerender();
    expect(result.current.filtros).toBe(antes);
  });

  it('descarta un distrito que el catálogo no conoce, pero no mientras el catálogo no cargó', () => {
    parametros.valor = new URLSearchParams('distrito=99&categoria=1');
    const { result, rerender } = renderHook(({ distritos }) => useEstadoDelMapaEnUrl(distritos, CATEGORIAS), {
      initialProps: { distritos: [] as { id: number }[] },
    });
    expect(result.current.filtros.distritoId).toBe(99);

    rerender({ distritos: DISTRITOS });
    expect(result.current.filtros).toEqual({ ...FILTROS_VACIOS, categoriaId: 1 });
  });
});
