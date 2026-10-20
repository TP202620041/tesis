import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  antesDeCerrarSesion,
  hayPasosAntesDeCerrarSesion,
} from '@/lib/hooks/antesDeCerrarSesion';
import { colaDeReportes } from '@/pwa/colaReportes';
import type { ReporteEnCola } from '../model/colaOffline';
import { useConfirmacionAlCerrarSesion } from './useConfirmacionAlCerrarSesion';

function enCola(clave: string, usuarioId: number): ReporteEnCola {
  return {
    idempotencyKey: clave,
    usuarioId,
    creadoEn: new Date().toISOString(),
    datos: { latitud: -12.1, longitud: -77.0, categoriaId: 1, ubicacionManual: false },
    foto: null,
    estado: 'pendiente',
    motivo: null,
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('useConfirmacionAlCerrarSesion', () => {
  it('sin reportes propios no agrega pasos al cierre', async () => {
    await colaDeReportes.guardar(enCola('ajeno', 8));
    const { unmount } = renderHook(() => useConfirmacionAlCerrarSesion(7));
    await new Promise((r) => setTimeout(r, 50));

    expect(hayPasosAntesDeCerrarSesion()).toBe(false);
    unmount();
  });

  it('con reportes propios pregunta; "Conservar" deja cerrar y los conserva', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    const { result, unmount } = renderHook(() => useConfirmacionAlCerrarSesion(7));
    await waitFor(() => expect(hayPasosAntesDeCerrarSesion()).toBe(true));

    let cerrado = false;
    act(() => {
      void antesDeCerrarSesion().then(() => {
        cerrado = true;
      });
    });
    await waitFor(() => expect(result.current.preguntando).toBe(1));
    expect(cerrado).toBe(false);

    await act(async () => {
      result.current.conservar();
    });

    await waitFor(() => expect(cerrado).toBe(true));
    expect(await colaDeReportes.listar()).toHaveLength(1);
    unmount();
  });

  it('si con la pregunta abierta se vacia la cola, el cierre se completa (no se cuelga)', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    const { result, unmount } = renderHook(() => useConfirmacionAlCerrarSesion(7));
    await waitFor(() => expect(hayPasosAntesDeCerrarSesion()).toBe(true));

    let cerrado = false;
    act(() => {
      void antesDeCerrarSesion().then(() => {
        cerrado = true;
      });
    });
    await waitFor(() => expect(result.current.preguntando).toBe(1));

    // Mientras se pregunta, el reporte se envia (otra pestaña) y la cola queda vacia.
    await act(async () => {
      await colaDeReportes.quitar('k1');
    });

    await waitFor(() => expect(cerrado).toBe(true));
    expect(result.current.preguntando).toBeNull();
    unmount();
  });

  it('si la cola solo baja (de 2 a 1) con la pregunta abierta, NO responde por el usuario', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    await colaDeReportes.guardar(enCola('k2', 7));
    const { result, unmount } = renderHook(() => useConfirmacionAlCerrarSesion(7));
    await waitFor(() => expect(hayPasosAntesDeCerrarSesion()).toBe(true));
    await waitFor(async () => expect(await colaDeReportes.listar()).toHaveLength(2));

    let cerrado = false;
    act(() => {
      void antesDeCerrarSesion().then(() => {
        cerrado = true;
      });
    });
    await waitFor(() => expect(result.current.preguntando).toBe(2));

    // El sincronizador envio uno mientras se preguntaba.
    await act(async () => {
      await colaDeReportes.quitar('k1');
    });

    await waitFor(() => expect(result.current.preguntando).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(cerrado).toBe(false);

    await act(async () => {
      result.current.conservar();
    });
    await waitFor(() => expect(cerrado).toBe(true));
    unmount();
  });

  it('al desmontarse con la pregunta abierta responde "Conservar"', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    const { result, unmount } = renderHook(() => useConfirmacionAlCerrarSesion(7));
    await waitFor(() => expect(hayPasosAntesDeCerrarSesion()).toBe(true));

    let cerrado = false;
    act(() => {
      void antesDeCerrarSesion().then(() => {
        cerrado = true;
      });
    });
    await waitFor(() => expect(result.current.preguntando).toBe(1));

    unmount();

    await waitFor(() => expect(cerrado).toBe(true));
    expect(await colaDeReportes.listar()).toHaveLength(1);
  });

  it('dos intentos de cierre seguidos comparten la misma pregunta; doble respuesta no rompe', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    const { result, unmount } = renderHook(() => useConfirmacionAlCerrarSesion(7));
    await waitFor(() => expect(hayPasosAntesDeCerrarSesion()).toBe(true));

    let cierres = 0;
    act(() => {
      void antesDeCerrarSesion().then(() => cierres++);
      void antesDeCerrarSesion().then(() => cierres++);
    });
    await waitFor(() => expect(result.current.preguntando).toBe(1));

    await act(async () => {
      result.current.conservar();
      result.current.conservar();
    });

    await waitFor(() => expect(cierres).toBe(2));
    unmount();
  });

  it('"Descartarlos" borra solo los del usuario y deja cerrar', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    await colaDeReportes.guardar(enCola('ajeno', 8));
    const { result, unmount } = renderHook(() => useConfirmacionAlCerrarSesion(7));
    await waitFor(() => expect(hayPasosAntesDeCerrarSesion()).toBe(true));

    let cerrado = false;
    act(() => {
      void antesDeCerrarSesion().then(() => {
        cerrado = true;
      });
    });
    await waitFor(() => expect(result.current.preguntando).toBe(1));

    await act(async () => {
      await result.current.descartar();
    });

    await waitFor(() => expect(cerrado).toBe(true));
    expect((await colaDeReportes.listar()).map((r) => r.idempotencyKey)).toEqual(['ajeno']);
    unmount();
  });
});
