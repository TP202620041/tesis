import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import { misAdhesiones } from './api';

/*
 * QA-1 M-6: el adaptador de «Reportes que apoyas», sobre el cliente real con
 * `fetch` falso (así se prueba lo que de verdad llega al hook).
 */

const fetchFalso = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchFalso.mockReset();
  vi.stubGlobal('fetch', fetchFalso);
  guardarToken('token-de-prueba');
});

afterEach(() => {
  vi.unstubAllGlobals();
  borrarToken();
});

describe('misAdhesiones (QA-1 M-6)', () => {
  it('pide la ruta propia con el token y deja absoluta la foto', async () => {
    fetchFalso.mockResolvedValue(
      Response.json([
        { id: 184, estado: 'EN_PROCESO', fotoUrl: '/media/fotos/reportes/3f2a.jpg' },
        { id: 190, estado: 'CANCELADO', fotoUrl: null },
      ]),
    );

    const reportes = await misAdhesiones();

    const [url, init] = fetchFalso.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/reportes\/mis-adhesiones$/);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
    expect(reportes.map((r) => r.id)).toEqual([184, 190]);
    expect(reportes[0]?.fotoUrl).toMatch(/^https?:\/\/.+\/media\/fotos\/reportes\/3f2a\.jpg$/);
    expect(reportes[1]?.fotoUrl).toBeNull();
  });

  it('una lista vacía llega vacía', async () => {
    fetchFalso.mockResolvedValue(Response.json([]));
    await expect(misAdhesiones()).resolves.toEqual([]);
  });
});
