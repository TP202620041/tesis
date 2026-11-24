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

function enCola(clave: string): ReporteEnCola {
  return {
    idempotencyKey: clave,
    usuarioId: 7,
    creadoEn: new Date().toISOString(),
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
      titulo: null,
      severidad: null,
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

  it('con sesion y un incompleto propio (NC-02) avisa sin bloquear y no lo envia', async () => {
    const viejo = enCola('viejo');
    delete viejo.datos.titulo;
    delete viejo.datos.severidad;
    await colaDeReportes.quitar('k1');
    await colaDeReportes.guardar(viejo);
    guardarToken('t');
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);

    render(<SincronizadorDeReportes />);

    // Con sesion hay dos regiones `status`: este aviso y la del envio
    // exitoso (US-06 Esc. 2), siempre montada y aqui vacia.
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .some(
            (r) =>
              r.textContent ===
              'Tienes 1 reporte sin enviar al que le faltan datos: complétalos en Mis reportes.',
          ),
      ).toBe(true),
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/mis-reportes#pendientes-de-envio');
    expect(crearReporte).not.toHaveBeenCalled();
  });

  it('sin sesion muestra el aviso no modal con enlace al login', async () => {
    render(<SincronizadorDeReportes />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tienes 1 reporte pendiente de envío: inicia sesión para enviarlos.',
    );
    expect(usuarioActualSinRedirigir).not.toHaveBeenCalled();
  });

  it('US-06 Esc. 2: al enviarse solo, avisa del envio exitoso aunque la cola quede vacia', async () => {
    guardarToken('t');
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);
    vi.mocked(crearReporte).mockResolvedValue({ ...CREADO, id: 41 });

    render(<SincronizadorDeReportes />);

    const enlace = await screen.findByRole('link', { name: 'Ver el reporte' });
    expect(enlace).toHaveAttribute('href', '/mis-reportes/41');
    expect(screen.getByText(/Se envió el reporte que guardaste sin conexión\./)).toBeInTheDocument();
    expect(await colaDeReportes.listar()).toEqual([]);
    // El aviso sigue despues de que la cola quedo vacia.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole('link', { name: 'Ver el reporte' })).toBeInTheDocument();
  });

  it('US-06 Esc. 2: el aviso de envio se cierra con su boton', async () => {
    guardarToken('t');
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);
    vi.mocked(crearReporte).mockResolvedValue(CREADO);

    render(<SincronizadorDeReportes />);
    await screen.findByText(/Se envió el reporte/);

    act(() => {
      screen.getByRole('button', { name: 'Cerrar aviso de envío' }).click();
    });
    expect(screen.queryByText(/Se envió el reporte/)).not.toBeInTheDocument();
  });

  it('US-06 Esc. 2: si el envio falla por red no hay aviso de exito', async () => {
    guardarToken('t');
    vi.mocked(usuarioActualSinRedirigir).mockResolvedValue(ANA);
    vi.mocked(crearReporte).mockRejectedValue(new NetworkError());

    render(<SincronizadorDeReportes />);
    await waitFor(() => expect(crearReporte).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByText(/Se envió/)).not.toBeInTheDocument();
    expect(await colaDeReportes.listar()).toHaveLength(1);
  });
});
