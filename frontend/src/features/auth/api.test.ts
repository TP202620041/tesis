import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { borrarToken, guardarToken, leerToken } from '@/lib/auth/token-storage';
import {
  clavePublicaVapid,
  confirmarCorreo,
  darDeBajaSuscripcionPush,
  descargarFotoDePerfil,
  reenviarConfirmacion,
  registrar,
} from './api';

/*
 * US-21: el adaptador HTTP de push, sobre el cliente real con `fetch` falso
 * (así se prueba lo que de verdad llega a `hooks/push.ts`).
 */

const fetchFalso = vi.fn<typeof fetch>();
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/a';

beforeEach(() => {
  fetchFalso.mockReset();
  vi.stubGlobal('fetch', fetchFalso);
  guardarToken('token-de-prueba');
});

afterEach(() => {
  vi.unstubAllGlobals();
  borrarToken();
});

describe('darDeBajaSuscripcionPush', () => {
  it('envía el endpoint en un DELETE con el token', async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 204 }));

    await darDeBajaSuscripcionPush(ENDPOINT);

    const [url, init] = fetchFalso.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/notificaciones\/suscripciones$/);
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBe(JSON.stringify({ endpoint: ENDPOINT }));
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('un 404 (no existe o es de otro usuario) resuelve como hecho, no lanza', async () => {
    fetchFalso.mockResolvedValue(Response.json({ message: 'No encontrada' }, { status: 404 }));
    await expect(darDeBajaSuscripcionPush(ENDPOINT, { enSegundoPlano: true })).resolves.toBeUndefined();
  });

  it('un 401 en segundo plano lanza sin navegar al login', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/perfil', search: '', assign });
    fetchFalso.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(darDeBajaSuscripcionPush(ENDPOINT, { enSegundoPlano: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('un 5xx lanza', async () => {
    fetchFalso.mockResolvedValue(Response.json({ message: 'Error' }, { status: 503 }));
    await expect(darDeBajaSuscripcionPush(ENDPOINT)).rejects.toMatchObject({ status: 503 });
  });
});

describe('clavePublicaVapid', () => {
  it('devuelve la clave del servidor', async () => {
    fetchFalso.mockResolvedValue(Response.json({ clavePublica: 'BNcR' }));
    await expect(clavePublicaVapid()).resolves.toBe('BNcR');
  });

  it('un 404 (servidor sin claves) es null: no se ofrece push', async () => {
    fetchFalso.mockResolvedValue(Response.json({ message: 'Sin claves' }, { status: 404 }));
    await expect(clavePublicaVapid()).resolves.toBeNull();
  });
});

describe('descargarFotoDePerfil', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:local/123') });
  });

  it('pide la foto de perfil con token y como blob, y devuelve una URL local', async () => {
    fetchFalso.mockResolvedValue(new Response('x', { headers: { 'Content-Type': 'image/png' } }));

    const src = await descargarFotoDePerfil('/api/perfiles/fotos/abc.png');

    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/perfiles\/fotos\/abc\.png$/);
    // Sin token el backend responde 401: un <img src> no puede mandarlo.
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-de-prueba');
    // Si se leyera como texto/JSON, createObjectURL recibiria otra cosa.
    expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/png', size: 1 }),
    );
    expect(src).toBe('blob:local/123');
  });

  it('no da el rodeo para una foto pública', async () => {
    // Las fotos de reporte se sirven como estático público: pedirlas con
    // fetch y convertirlas a blob sería trabajo inútil.
    const src = await descargarFotoDePerfil('/media/fotos/reportes/abc.png');

    expect(fetchFalso).not.toHaveBeenCalled();
    expect(src).toBe('/media/fotos/reportes/abc.png');
  });
});

describe('confirmación del correo (NC-09)', () => {
  it('el registro devuelve la cuenta por confirmar y no toca la sesión', async () => {
    fetchFalso.mockResolvedValue(Response.json({ email: 'ana@lima.pe', vigenciaEnlaceHoras: 24 }, { status: 201 }));

    const cuenta = await registrar({
      nombre: 'Ana',
      apellido: 'Ruiz',
      email: 'ana@lima.pe',
      password: 'secreta123',
      aceptaTerminos: true,
      versionTerminos: '2026-10-v1',
    });

    expect(cuenta).toEqual({ email: 'ana@lima.pe', vigenciaEnlaceHoras: 24 });
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/auth\/registro$/);
    // Ruta pública: sin token, y el que había sigue igual (no hay sesión nueva).
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    expect(leerToken()).toBe('token-de-prueba');
  });

  it('confirmar manda el token en el cuerpo, sin Authorization, y acepta el 204', async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(confirmarCorreo('abc')).resolves.toBeUndefined();

    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/auth\/confirmar-correo$/);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ token: 'abc' }));
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('un 409 de la confirmación llega con su código', async () => {
    fetchFalso.mockResolvedValue(
      Response.json({ status: 409, message: 'El enlace venció.', codigo: 'CONFIRMACION_VENCIDA' }, { status: 409 }),
    );
    await expect(confirmarCorreo('abc')).rejects.toMatchObject({ status: 409, codigo: 'CONFIRMACION_VENCIDA' });
  });

  it('reenviar acepta el 202 sin cuerpo', async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 202, headers: { 'Content-Length': '0' } }));

    await expect(reenviarConfirmacion('ana@lima.pe')).resolves.toBeUndefined();

    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/auth\/reenviar-confirmacion$/);
    expect(init?.body).toBe(JSON.stringify({ email: 'ana@lima.pe' }));
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });
});
