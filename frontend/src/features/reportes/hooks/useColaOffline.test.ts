import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { generacionDeSesion } from '@/lib/auth/token-storage';
import { colaDeReportes } from '@/pwa/colaReportes';
import { crearReporte } from '../api';
import type { ReporteEnCola } from '../model/colaOffline';
import {
  INTERVALO_DE_REINTENTO,
  olvidarEsperasDeModeracion,
  useCantidadDeIncompletos,
  useReportesEnCola,
  useResumenDeLaCola,
  useSincronizacionAutomatica,
} from './useColaOffline';

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  crearReporte: vi.fn(),
}));

function enCola(clave: string, usuarioId: number, creadoEn = new Date().toISOString()): ReporteEnCola {
  return {
    idempotencyKey: clave,
    usuarioId,
    creadoEn,
    datos: {
      latitud: -12.1,
      longitud: -77.0,
      categoriaId: 1,
      titulo: 'Bache en Miraflores',
      severidad: 'MEDIA',
      ubicacionManual: false,
    },
    foto: null,
    estado: 'pendiente',
    motivo: null,
  };
}

/** Ana identificada en la sesion vigente. */
const ana = () => ({ usuarioId: 7, generacion: generacionDeSesion() });

const CREADO = {
  id: 1,
  esAdhesion: false,
  totalAdhesiones: 1,
  distritoNombre: null,
  categoriaNombre: null,
  fotoUrl: null,
  titulo: null,
  severidad: null,
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  olvidarEsperasDeModeracion();
  // Sin red: cada intento falla y el reporte sigue en la cola (asi se puede
  // contar cuantas veces se intento).
  vi.mocked(crearReporte).mockRejectedValue(new NetworkError());
});

afterEach(() => {
  vi.mocked(crearReporte).mockReset();
  vi.restoreAllMocks();
});

describe('useReportesEnCola', () => {
  it('muestra los del usuario con su estado visible y se actualiza al descartar', async () => {
    const hace3Dias = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    await colaDeReportes.guardar(enCola('k1', 7));
    await colaDeReportes.guardar(enCola('viejo', 7, hace3Dias));
    await colaDeReportes.guardar(enCola('ajeno', 8));
    const { result } = renderHook(() => useReportesEnCola(7));
    await waitFor(() => expect(result.current.pendientes).toHaveLength(2));
    expect(result.current.pendientes.map((r) => r.visible).sort()).toEqual(['caducado', 'pendiente']);

    await act(async () => {
      await result.current.descartar('k1');
    });

    await waitFor(() => expect(result.current.pendientes).toHaveLength(1));
  });
});

/** NC-02: como lo guardaba la version anterior del formulario. */
function incompleto(clave: string, usuarioId: number): ReporteEnCola {
  const datos = { ...enCola(clave, usuarioId).datos };
  delete datos.titulo;
  delete datos.severidad;
  return { ...enCola(clave, usuarioId), datos };
}

describe('reporte incompleto (NC-02) de punta a punta', () => {
  it('no se envia solo; al completarlo, la sincronizacion lo envia con la MISMA clave', async () => {
    vi.mocked(crearReporte).mockResolvedValue(CREADO);
    await colaDeReportes.guardar(incompleto('clave-vieja', 7));
    const cola = renderHook(() => useReportesEnCola(7));
    renderHook(() => useSincronizacionAutomatica(ana()));
    await waitFor(() => expect(cola.result.current.pendientes[0]?.visible).toBe('incompleto'));
    await new Promise((r) => setTimeout(r, 50));
    expect(crearReporte).not.toHaveBeenCalled();

    let error: string | null = 'sin llamar';
    await act(async () => {
      error = await cola.result.current.completar('clave-vieja', {
        titulo: 'Bache en Miraflores',
        severidad: 'ALTA',
      });
    });

    expect(error).toBeNull();
    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(1));
    expect(crearReporte).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'clave-vieja',
        titulo: 'Bache en Miraflores',
        severidad: 'ALTA',
      }),
      { redirigirEn401: false },
    );
    await waitFor(async () => expect(await colaDeReportes.listar()).toEqual([]));
  });

  it('useCantidadDeIncompletos cuenta solo los incompletos del usuario', async () => {
    await colaDeReportes.guardar(incompleto('k1', 7));
    await colaDeReportes.guardar(incompleto('ajeno', 8));
    await colaDeReportes.guardar(enCola('k2', 7));
    const { result } = renderHook(() => useCantidadDeIncompletos(7));
    await waitFor(() => expect(result.current).toBe(1));

    await act(async () => {
      await colaDeReportes.quitar('k1');
    });
    await waitFor(() => expect(result.current).toBe(0));
  });

  it('no cuenta como reenviable en el resumen del dispositivo', async () => {
    await colaDeReportes.guardar(incompleto('k1', 7));
    const { result } = renderHook(() => useResumenDeLaCola());
    await waitFor(() => expect(result.current).toEqual({ total: 1, reenviables: 0 }));
  });
});

describe('useResumenDeLaCola', () => {
  it('cuenta todo el dispositivo y cuantos se reenviarian solos', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    await colaDeReportes.guardar({ ...enCola('k2', 8), estado: 'rechazado', motivo: 'x' });
    const { result } = renderHook(() => useResumenDeLaCola());

    await waitFor(() => expect(result.current).toEqual({ total: 2, reenviables: 1 }));
  });
});

describe('useSincronizacionAutomatica', () => {
  it('con pendientes propios intenta al montarse y otra vez al volver la conexion', async () => {
    await colaDeReportes.guardar(enCola('k1', 7));
    renderHook(() => useSincronizacionAutomatica(ana()));
    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(2));
    // El reenvio en segundo plano nunca lleva al login.
    expect(crearReporte).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: 'k1' }),
      { redirigirEn401: false },
    );
  });

  it.each([
    ['FOTO_NO_PERMITIDA', 'foto', /^La foto no está permitida\. Descártalo/],
    ['TEXTO_NO_PERMITIDO', 'titulo', /^El título tiene palabras que no están permitidas\. Descártalo/],
  ])('NC-10c: un 400 %s lo deja rechazado, sin reintentarlo', async (codigo, campo, motivo) => {
    vi.mocked(crearReporte).mockRejectedValue(new ApiError(400, 'No permitido', '/api/reportes', [campo], codigo));
    await colaDeReportes.guardar(enCola('k1', 7));
    const cola = renderHook(() => useReportesEnCola(7));
    renderHook(() => useSincronizacionAutomatica(ana()));

    await waitFor(() => expect(cola.result.current.pendientes[0]?.visible).toBe('rechazado'));
    expect(cola.result.current.pendientes[0]?.motivo).toMatch(motivo);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(crearReporte).toHaveBeenCalledTimes(1);
  });

  it('NC-10c: el 503 MODERACION_NO_DISPONIBLE lo deja pendiente y se reintenta', async () => {
    vi.mocked(crearReporte).mockRejectedValue(
      new ApiError(503, 'Sin revisar', '/api/reportes', [], 'MODERACION_NO_DISPONIBLE'),
    );
    await colaDeReportes.guardar(enCola('k1', 7));
    renderHook(() => useSincronizacionAutomatica(ana()));
    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(2));
    expect(crearReporte).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: 'k1' }),
      { redirigirEn401: false },
    );
    expect((await colaDeReportes.listar())[0]?.estado).toBe('pendiente');
  });

  it('al enviarse, el reporte sale de la cola', async () => {
    vi.mocked(crearReporte).mockResolvedValue(CREADO);
    await colaDeReportes.guardar(enCola('k1', 7));
    renderHook(() => useSincronizacionAutomatica(ana()));

    await waitFor(async () => expect(await colaDeReportes.listar()).toEqual([]));
  });

  it('sin sesion o sin pendientes propios no arma listeners ni intervalo', async () => {
    const intervalo = vi.spyOn(window, 'setInterval');
    const escuchar = vi.spyOn(window, 'addEventListener');
    await colaDeReportes.guardar(enCola('ajeno', 8));
    renderHook(() => useSincronizacionAutomatica(ana()));
    renderHook(() => useSincronizacionAutomatica(null));
    await new Promise((r) => setTimeout(r, 50));

    expect(intervalo).not.toHaveBeenCalledWith(expect.any(Function), INTERVALO_DE_REINTENTO);
    expect(escuchar).not.toHaveBeenCalledWith('online', expect.any(Function));
    expect(crearReporte).not.toHaveBeenCalled();
  });

  it('al desmontarse quita online, visibilitychange y el intervalo', async () => {
    const quitarDeVentana = vi.spyOn(window, 'removeEventListener');
    const quitarDeDocumento = vi.spyOn(document, 'removeEventListener');
    const limpiarIntervalo = vi.spyOn(window, 'clearInterval');
    await colaDeReportes.guardar(enCola('k1', 7));
    const { unmount } = renderHook(() => useSincronizacionAutomatica(ana()));
    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(1));

    unmount();

    expect(quitarDeVentana).toHaveBeenCalledWith('online', expect.any(Function));
    expect(quitarDeDocumento).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(limpiarIntervalo).toHaveBeenCalled();
    // Despues de desmontar, volver la conexion ya no dispara nada.
    window.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 50));
    expect(crearReporte).toHaveBeenCalledTimes(1);
  });
});
