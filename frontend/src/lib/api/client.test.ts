import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiDescargar, apiFetch, conFotoAbsoluta } from './client';
import { ApiError, NetworkError } from './errors';
import { borrarToken, guardarToken, leerToken } from '@/lib/auth/token-storage';

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

function cabeceraEnviada(nombre: string): string | null {
  const init = fetchFalso.mock.calls[0]?.[1];
  return new Headers(init?.headers).get(nombre);
}

describe('apiDescargar', () => {
  it('trae el archivo con el token y devuelve su Content-Disposition', async () => {
    fetchFalso.mockResolvedValue(
      new Response('a;b\n1;2', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="reportes-miraflores.csv"',
        },
      }),
    );

    const archivo = await apiDescargar('/api/reportes/exportar?formato=CSV');

    expect(cabeceraEnviada('Authorization')).toBe('Bearer token-de-prueba');
    expect(fetchFalso.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(archivo.contentDisposition).toBe('attachment; filename="reportes-miraflores.csv"');
    expect(await archivo.contenido.text()).toBe('a;b\n1;2');
  });

  it('sin la cabecera (no expuesta por CORS) devuelve null, no un nombre inventado', async () => {
    fetchFalso.mockResolvedValue(new Response('x', { status: 200 }));
    const archivo = await apiDescargar('/api/reportes/exportar');
    expect(archivo.contentDisposition).toBeNull();
  });

  it('un 400 llega como ApiError con el mensaje del backend', async () => {
    fetchFalso.mockResolvedValue(
      Response.json(
        { message: 'No hay reportes que coincidan con los filtros seleccionados para exportar' },
        { status: 400 },
      ),
    );
    await expect(apiDescargar('/api/reportes/exportar')).rejects.toEqual(
      new ApiError(400, 'No hay reportes que coincidan con los filtros seleccionados para exportar'),
    );
  });
});

/**
 * Regresión de `ejecutar()`, el camino común de `apiFetch` y `apiDescargar`:
 * el 401 centralizado y el error de red deben seguir iguales en ambos.
 */
describe.each([
  ['apiFetch', (ruta: string) => apiFetch(ruta)],
  ['apiDescargar', (ruta: string) => apiDescargar(ruta)],
] as const)('%s comparte el manejo de errores', (_nombre, llamar) => {
  it('un 401 borra el token y navega al login con la ruta actual como redirect', async () => {
    // jsdom no implementa la navegación: se reemplaza `location` por un doble.
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/mis-reportes/7', search: '?tab=historial', assign });
    fetchFalso.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(llamar('/api/reportes/mis-reportes')).rejects.toBeInstanceOf(ApiError);

    expect(leerToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/mis-reportes/7?tab=historial')}`,
    );
  });

  it('si fetch rechaza (red o CORS) lanza NetworkError, no ApiError', async () => {
    fetchFalso.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(llamar('/api/auth/me')).rejects.toBeInstanceOf(NetworkError);
    // Sin respuesta no hay 401: la sesión se conserva.
    expect(leerToken()).toBe('token-de-prueba');
  });
});

describe('apiFetch', () => {
  it('con redirigirEn401: false borra el token y lanza el 401, pero no navega', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/mapa', search: '', assign });
    fetchFalso.mockResolvedValue(new Response(null, { status: 401 }));

    const fallo = apiFetch('/api/auth/me', { redirigirEn401: false });

    await expect(fallo).rejects.toMatchObject({ status: 401 });
    expect(leerToken()).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('sigue interpretando JSON tras extraer la ejecución común', async () => {
    fetchFalso.mockResolvedValue(Response.json({ id: 7 }));
    await expect(apiFetch<{ id: number }>('/api/auth/me')).resolves.toEqual({ id: 7 });
    expect(cabeceraEnviada('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('una respuesta 202 sin cuerpo devuelve undefined', async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 202, headers: { 'Content-Length': '0' } }));
    await expect(apiFetch('/api/auth/recuperar-password', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('conFotoAbsoluta', () => {
  it('compone la URL absoluta de una foto relativa y conserva el resto', () => {
    const reporte = { id: 7, fotoUrl: '/media/fotos/reportes/a.png' };

    const resultado = conFotoAbsoluta(reporte);

    expect(resultado.fotoUrl).toMatch(/^https?:\/\/.+\/media\/fotos\/reportes\/a\.png$/);
    expect(resultado.id).toBe(7);
    expect(reporte.fotoUrl).toBe('/media/fotos/reportes/a.png');
  });

  it('es idempotente y no toca una entidad sin foto', () => {
    const absoluta = conFotoAbsoluta({ fotoUrl: '/media/x.png' });
    const sinFoto = { id: 1, fotoUrl: null };

    expect(conFotoAbsoluta(absoluta).fotoUrl).toBe(absoluta.fotoUrl);
    expect(conFotoAbsoluta(sinFoto)).toBe(sinFoto);
    const sinCampo: { id: number; fotoUrl?: string } = { id: 2 };
    expect(conFotoAbsoluta(sinCampo).fotoUrl).toBeUndefined();
  });
});
