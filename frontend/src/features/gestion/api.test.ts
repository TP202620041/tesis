import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import { responsableActivo } from './api';

/*
 * US-15 / QA-1 M-4: el adaptador del responsable vigente, sobre el cliente
 * real con `fetch` falso (así se prueba lo que de verdad llega a
 * `useResponsable`, incluido el 204 sin cuerpo).
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

describe('responsableActivo (US-15)', () => {
  it('con responsable vigente devuelve la asignación', async () => {
    fetchFalso.mockResolvedValue(
      Response.json({ id: 12, reporteId: 186, responsable: 'Cuadrilla 3', activo: true }),
    );

    const asignacion = await responsableActivo(186);

    expect(asignacion?.responsable).toBe('Cuadrilla 3');
    const [url, init] = fetchFalso.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/reportes\/186\/responsable$/);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('QA-1 M-4: el 204 sin cuerpo (sin responsable) es null, no undefined', async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(responsableActivo(186)).resolves.toBeNull();
  });

  it('transición: el 404 de un backend anterior a QA-1 sigue siendo «sin responsable»', async () => {
    fetchFalso.mockResolvedValue(
      Response.json({ message: 'El reporte no tiene responsable asignado' }, { status: 404 }),
    );

    await expect(responsableActivo(186)).resolves.toBeNull();
  });

  it('otro error (403 de otro distrito) se propaga', async () => {
    fetchFalso.mockResolvedValue(Response.json({ message: 'Acceso denegado' }, { status: 403 }));

    await expect(responsableActivo(186)).rejects.toBeInstanceOf(ApiError);
  });
});
