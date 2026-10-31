import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { bandejaDeModeracion } from '../api';
import type { FiltrosDeModeracion, PaginaDeModeracion } from '../model/tipos';
import { useBandejaModeracion } from './useBandejaModeracion';

vi.mock('../api', () => ({ bandejaDeModeracion: vi.fn() }));

afterEach(() => {
  vi.mocked(bandejaDeModeracion).mockReset();
});

const PAGINA: PaginaDeModeracion = { filas: [], pagina: 0, totalPaginas: 1, total: 0 };

describe('useBandejaModeracion (NC-11b)', () => {
  it('pide la vista y la página, y vuelve a pedir al cambiarlas', async () => {
    vi.mocked(bandejaDeModeracion).mockResolvedValue(PAGINA);
    const { result, rerender } = renderHook(
      ({ vista, pagina }: FiltrosDeModeracion) => useBandejaModeracion({ vista, pagina }),
      { initialProps: { vista: 'PENDIENTE', pagina: 0 } as FiltrosDeModeracion },
    );

    await waitFor(() => expect(result.current.estado).toBe('listo'));
    expect(bandejaDeModeracion).toHaveBeenCalledWith({ vista: 'PENDIENTE', pagina: 0 });

    rerender({ vista: 'OCULTOS', pagina: 0 });
    await waitFor(() => expect(bandejaDeModeracion).toHaveBeenCalledWith({ vista: 'OCULTOS', pagina: 0 }));
    expect(bandejaDeModeracion).toHaveBeenCalledTimes(2);
  });

  it('un fallo queda en error con su mensaje', async () => {
    vi.mocked(bandejaDeModeracion).mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useBandejaModeracion({ vista: 'PENDIENTE', pagina: 0 }));
    await waitFor(() => expect(result.current.estado).toBe('error'));
    expect(result.current.error?.mensaje).toBe('Ocurrió un error inesperado.');
  });
});
