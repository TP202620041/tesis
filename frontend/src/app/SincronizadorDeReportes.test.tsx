import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { usuarioActualSinRedirigir } from '@/features/auth/api';
import type { ReporteEnCola } from '@/features/reportes/model/colaOffline';
import { crearReporte } from '@/features/reportes/api';
import { NetworkError } from '@/lib/api/errors';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import type { Usuario } from '@/lib/types/domain';
import { colaDeReportes } from '@/pwa/colaReportes';
import { SincronizadorDeReportes } from './SincronizadorDeReportes';

vi.mock('next/navigation', () => ({ usePathname: () => '/mapa' }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/features/auth/api', () => ({ usuarioActualSinRedirigir: vi.fn() }));
vi.mock('@/features/reportes/api', async (original) => ({
  ...(await original<typeof import('@/features/reportes/api')>()),
  crearReporte: vi.fn(),
}));

const ANA = { id: 7, rol: 'CIUDADANO', nombre: 'Ana' } as Usuario;

function enCola(clave: string): ReporteEnCola {
  return {
    idempotencyKey: clave,
    usuarioId: 7,
    creadoEn: new Date().toISOString(),
    datos: { latitud: -12.1, longitud: -77.0, categoriaId: 1, ubicacionManual: false },
    foto: null,
    estado: 'pendiente',
    motivo: null,
  };
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await colaDeReportes.guardar(enCola('k1'));
});

afterEach(() => {
  borrarToken();
  vi.mocked(usuarioActualSinRedirigir).mockReset();
  vi.mocked(crearReporte).mockReset();
});

describe('SincronizadorDeReportes', () => {
  it('si /me falla por red, al volver la conexion identifica al usuario y envia', async () => {
    guardarToken('t');
    vi.mocked(usuarioActualSinRedirigir)
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValue(ANA);
    vi.mocked(crearReporte).mockResolvedValue({
      id: 1,
      esAdhesion: false,
      totalAdhesiones: 1,
      distritoNombre: null,
      categoriaNombre: null,
      fotoUrl: null,
    });
    render(<SincronizadorDeReportes />);
    await waitFor(() => expect(usuarioActualSinRedirigir).toHaveBeenCalledTimes(1));
    expect(crearReporte).not.toHaveBeenCalled();
    // Que el fallo ya se haya procesado (y el listener de `online` exista).
    await new Promise((r) => setTimeout(r, 50));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await colaDeReportes.listar()).toEqual([]));
  });

  it('sin sesion muestra el aviso no modal con enlace al login', async () => {
    render(<SincronizadorDeReportes />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tienes 1 reporte pendiente de envío: inicia sesión para enviarlos.',
    );
    expect(usuarioActualSinRedirigir).not.toHaveBeenCalled();
  });
});
