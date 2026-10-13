import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiDescargar, apiFetch } from './client';
import { ApiError } from './errors';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';

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

describe('apiFetch', () => {
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
