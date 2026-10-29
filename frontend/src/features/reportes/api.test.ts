import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarToken, guardarToken, leerToken } from '@/lib/auth/token-storage';
import { ApiError } from '@/lib/api/errors';
import { clasificarFoto, misAdhesiones } from './api';

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

describe('clasificarFoto (NC-04)', () => {
  const FOTO = new File(['bytes'], 'bache.jpg', { type: 'image/jpeg' });

  it('envía la foto en multipart con el token y devuelve la sugerencia', async () => {
    fetchFalso.mockResolvedValue(
      Response.json({ categoriaId: 1, categoriaNombre: 'Bache', fotoRechazada: false }),
    );
    const control = new AbortController();

    const clasificacion = await clasificarFoto(FOTO, control.signal);

    const [url, init] = fetchFalso.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/clasificaciones$/);
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBe(control.signal);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
    // El boundary lo pone el navegador: el cliente no fija Content-Type.
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    expect((init?.body as FormData).get('foto')).toBe(FOTO);
    expect(clasificacion).toEqual({
      fotoNoPermitida: false,
      sugerencia: { categoriaId: 1, categoriaNombre: 'Bache' },
    });
  });

  it('«sin sugerencia» (los dos campos nulos) llega con la sugerencia en null', async () => {
    fetchFalso.mockResolvedValue(
      Response.json({ categoriaId: null, categoriaNombre: null, fotoRechazada: false }),
    );
    await expect(clasificarFoto(FOTO)).resolves.toEqual({ fotoNoPermitida: false, sugerencia: null });
  });

  it('NC-10c: con fotoRechazada la foto no está permitida, sin sugerencia', async () => {
    fetchFalso.mockResolvedValue(
      Response.json({ categoriaId: null, categoriaNombre: null, fotoRechazada: true }),
    );
    await expect(clasificarFoto(FOTO)).resolves.toEqual({ fotoNoPermitida: true });
  });

  it('el 409 de formato llega como ApiError con el mensaje del backend', async () => {
    fetchFalso.mockResolvedValue(
      Response.json(
        { status: 409, message: 'Formato de foto no permitido (usa JPG, PNG o WEBP)' },
        { status: 409 },
      ),
    );
    const fallo = clasificarFoto(FOTO);
    await expect(fallo).rejects.toBeInstanceOf(ApiError);
    await expect(fallo).rejects.toMatchObject({
      status: 409,
      message: 'Formato de foto no permitido (usa JPG, PNG o WEBP)',
    });
  });

  it('un 401 borra el token pero no saca al ciudadano del formulario', async () => {
    const assign = vi.fn();
    // jsdom no implementa la navegación: se reemplaza `location` por un doble.
    vi.stubGlobal('location', { pathname: '/reportar', search: '', assign });
    fetchFalso.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(clasificarFoto(FOTO)).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
    expect(leerToken()).toBeNull();
  });
});
