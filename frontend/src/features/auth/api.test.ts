import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import { clavePublicaVapid, darDeBajaSuscripcionPush } from './api';

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
