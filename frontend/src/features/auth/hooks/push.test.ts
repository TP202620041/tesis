import { describe, expect, it, vi } from 'vitest';
import type { NavegadorPush } from '@/pwa/push';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { base64UrlABytes } from '../model/push';
import {
  activarPush,
  bajaDePushAlCerrarSesion,
  desactivarPush,
  estadoDePush,
  reRegistrarPushAlIniciarSesion,
  type ServidorPush,
} from './push';

/*
 * En jsdom no hay push real: se prueba la orquestacion con dobles del
 * navegador (PushManager/Notification) y del API.
 */

const CLAVE =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const CLAVE_VIEJA =
  'BPXa4nY0j3d2yAZ1kH3vT8pV0Yy6rM3qkq0b8D4nQmS1oZtq2pD7rS9wE2eF8gH1jK3lM5nO7pQ9rS1tU3vW5xY';

type SuscripcionFalsa = PushSubscription & { unsubscribe: ReturnType<typeof vi.fn> };

function suscripcion(endpoint: string, clave: string | null): SuscripcionFalsa {
  return {
    endpoint,
    options: { applicationServerKey: clave ? base64UrlABytes(clave).buffer : null, userVisibleOnly: true },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p256', auth: 'auth' } }),
    unsubscribe: vi.fn(async () => true),
  } as unknown as SuscripcionFalsa;
}

function navegador({
  soportado = true,
  permiso = 'default' as NotificationPermission,
  respuesta = 'granted' as NotificationPermission,
  actual = null as SuscripcionFalsa | null,
} = {}) {
  let vigente = actual;
  const nav = {
    soportado: () => soportado,
    permiso: () => permiso,
    pedirPermiso: vi.fn(async () => respuesta),
    suscripcionActual: vi.fn(async () => vigente),
    suscribir: vi.fn(async (clave: Uint8Array<ArrayBuffer>) => {
      vigente = suscripcion('https://fcm.googleapis.com/fcm/send/nueva', null);
      Object.assign(vigente.options, { applicationServerKey: clave.buffer });
      return vigente;
    }),
    userAgent: () => 'Navegador de prueba',
  } satisfies NavegadorPush;
  return nav;
}

function servidor(clave: string | null = CLAVE) {
  return {
    clavePublica: vi.fn<ServidorPush['clavePublica']>(async () => clave),
    registrar: vi.fn<ServidorPush['registrar']>(async () => undefined),
    darDeBaja: vi.fn<ServidorPush['darDeBaja']>(async () => undefined),
  } satisfies ServidorPush;
}

describe('estadoDePush', () => {
  it('distingue no soportado, sin claves, denegado, inactivo y activo', async () => {
    expect(await estadoDePush(navegador({ soportado: false }), servidor())).toBe('no-soportado');
    expect(await estadoDePush(navegador(), servidor(null))).toBe('sin-claves');
    expect(await estadoDePush(navegador({ permiso: 'denied' }), servidor())).toBe('denegado');
    expect(await estadoDePush(navegador(), servidor())).toBe('inactivo');
    expect(
      await estadoDePush(navegador({ actual: suscripcion('https://fcm.googleapis.com/x', CLAVE) }), servidor()),
    ).toBe('activo');
  });
});

describe('activarPush', () => {
  it('clave → permiso → subscribe → registro con toJSON() y userAgent', async () => {
    const nav = navegador();
    const api = servidor();

    expect(await activarPush(nav, api)).toBe('activo');

    expect(nav.suscribir).toHaveBeenCalledWith(base64UrlABytes(CLAVE));
    expect(api.registrar).toHaveBeenCalledWith(
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/nueva',
        expirationTime: null,
        keys: { p256dh: 'p256', auth: 'auth' },
      },
      'Navegador de prueba',
    );
    const [permiso] = nav.pedirPermiso.mock.invocationCallOrder;
    const [suscribe] = nav.suscribir.mock.invocationCallOrder;
    const [registro] = api.registrar.mock.invocationCallOrder;
    expect(permiso).toBeLessThan(suscribe ?? 0);
    expect(suscribe).toBeLessThan(registro ?? 0);
  });

  it('sin claves en el servidor (404) no pide permiso', async () => {
    const nav = navegador();
    expect(await activarPush(nav, servidor(null))).toBe('sin-claves');
    expect(nav.pedirPermiso).not.toHaveBeenCalled();
  });

  it('permiso denegado: no suscribe ni registra', async () => {
    const nav = navegador({ respuesta: 'denied' });
    const api = servidor();
    expect(await activarPush(nav, api)).toBe('denegado');
    expect(nav.suscribir).not.toHaveBeenCalled();
    expect(api.registrar).not.toHaveBeenCalled();
  });

  it('permiso descartado (cerró el diálogo) queda inactivo', async () => {
    expect(await activarPush(navegador({ respuesta: 'default' }), servidor())).toBe('inactivo');
  });

  it('reutiliza una suscripción hecha con la misma clave', async () => {
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/vieja', CLAVE);
    const nav = navegador({ actual });
    const api = servidor();

    await activarPush(nav, api);

    expect(nav.suscribir).not.toHaveBeenCalled();
    expect(actual.unsubscribe).not.toHaveBeenCalled();
    expect(api.registrar.mock.calls[0]?.[0]).toMatchObject({ endpoint: 'https://fcm.googleapis.com/fcm/send/vieja' });
  });

  it('sin consentimiento el registro da 409 y el error sube', async () => {
    const api = servidor();
    api.registrar.mockRejectedValue(new ApiError(409, 'Falta el consentimiento'));
    await expect(activarPush(navegador(), api)).rejects.toMatchObject({ status: 409 });
  });
});

describe('desactivarPush', () => {
  it('da de baja este navegador en el servidor y cancela la suscripción', async () => {
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    const api = servidor();

    expect(await desactivarPush({}, navegador({ actual }), api)).toBe('inactivo');

    expect(api.darDeBaja).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/a');
    expect(actual.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('soloLocal (tras retirar el consentimiento) no llama al servidor', async () => {
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    const api = servidor();
    await desactivarPush({ soloLocal: true }, navegador({ actual }), api);
    expect(api.darDeBaja).not.toHaveBeenCalled();
    expect(actual.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('reRegistrarPushAlIniciarSesion', () => {
  it('sin suscripción en el navegador no hace nada (nunca suscribe solo)', async () => {
    const nav = navegador({ permiso: 'granted' });
    const api = servidor();
    await reRegistrarPushAlIniciarSesion(nav, api);
    expect(nav.suscribir).not.toHaveBeenCalled();
    expect(api.registrar).not.toHaveBeenCalled();
  });

  it('sin permiso concedido no hace nada', async () => {
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    const api = servidor();
    await reRegistrarPushAlIniciarSesion(navegador({ permiso: 'default', actual }), api);
    expect(api.registrar).not.toHaveBeenCalled();
  });

  it('con la misma clave vuelve a registrar la suscripción existente', async () => {
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    const nav = navegador({ permiso: 'granted', actual });
    const api = servidor();

    await reRegistrarPushAlIniciarSesion(nav, api);

    expect(nav.suscribir).not.toHaveBeenCalled();
    expect(api.registrar.mock.calls[0]?.[0]).toMatchObject({ endpoint: 'https://fcm.googleapis.com/fcm/send/a' });
  });

  it('rotación de claves: cancela, se vuelve a suscribir con la nueva y registra', async () => {
    const vieja = suscripcion('https://fcm.googleapis.com/fcm/send/vieja', CLAVE_VIEJA);
    const nav = navegador({ permiso: 'granted', actual: vieja });
    const api = servidor(CLAVE);

    await reRegistrarPushAlIniciarSesion(nav, api);

    expect(vieja.unsubscribe).toHaveBeenCalledTimes(1);
    expect(nav.suscribir).toHaveBeenCalledWith(base64UrlABytes(CLAVE));
    expect(api.registrar.mock.calls[0]?.[0]).toMatchObject({ endpoint: 'https://fcm.googleapis.com/fcm/send/nueva' });
  });

  it('nunca lanza (409 sin consentimiento, red caída)', async () => {
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    const api = servidor();
    api.registrar.mockRejectedValue(new ApiError(409, 'Sin consentimiento'));
    await expect(
      reRegistrarPushAlIniciarSesion(navegador({ permiso: 'granted', actual }), api),
    ).resolves.toBeUndefined();
  });
});

describe('bajaDePushAlCerrarSesion', () => {
  it('da de baja el endpoint de este navegador y conserva la suscripción', async () => {
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    const api = servidor();

    await bajaDePushAlCerrarSesion(1_000, navegador({ actual }), api);

    expect(api.darDeBaja).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/a');
    expect(actual.unsubscribe).not.toHaveBeenCalled();
  });

  it('sin suscripción no llama al servidor', async () => {
    const api = servidor();
    await bajaDePushAlCerrarSesion(1_000, navegador(), api);
    expect(api.darDeBaja).not.toHaveBeenCalled();
  });

  it.each([
    ['sin red', new NetworkError()],
    ['un 5xx', new ApiError(503, 'No disponible')],
  ])('si la baja falla (%s), cancela la suscripción local y termina sin lanzar', async (_caso, error) => {
    const api = servidor();
    api.darDeBaja.mockRejectedValue(error);
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);

    await expect(bajaDePushAlCerrarSesion(1_000, navegador({ actual }), api)).resolves.toBeUndefined();

    // El dispositivo deja de recibir los avisos de quien salió.
    expect(actual.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('un 404 (el endpoint no es de quien sale) no cancela la suscripción de otra persona', async () => {
    const api = servidor();
    api.darDeBaja.mockRejectedValue(new ApiError(404, 'No encontrada'));
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/de-ana', CLAVE);

    await bajaDePushAlCerrarSesion(1_000, navegador({ actual }), api);

    expect(actual.unsubscribe).not.toHaveBeenCalled();
  });

  it('otro error (p. ej. un fallo del navegador) tampoco cancela', async () => {
    const api = servidor();
    api.darDeBaja.mockRejectedValue(new Error('inesperado'));
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    await bajaDePushAlCerrarSesion(1_000, navegador({ actual }), api);
    expect(actual.unsubscribe).not.toHaveBeenCalled();
  });

  it('si el servidor no responde, no espera más que el tope ni cancela la suscripción', async () => {
    const api = servidor();
    api.darDeBaja.mockReturnValue(new Promise(() => undefined));
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    const inicio = Date.now();
    await bajaDePushAlCerrarSesion(30, navegador({ actual }), api);
    expect(Date.now() - inicio).toBeLessThan(1_000);
    expect(actual.unsubscribe).not.toHaveBeenCalled();
  });

  it('espera al re-registro en curso antes del DELETE (sin carrera)', async () => {
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    const nav = navegador({ permiso: 'granted', actual });
    const api = servidor();
    let terminarRegistro!: () => void;
    api.registrar.mockReturnValue(new Promise<void>((r) => (terminarRegistro = r)));

    const reRegistro = reRegistrarPushAlIniciarSesion(nav, api);
    await vi.waitFor(() => expect(api.registrar).toHaveBeenCalledTimes(1));
    const baja = bajaDePushAlCerrarSesion(1_000, nav, api);
    await new Promise((r) => setTimeout(r, 20));
    // El POST sigue en vuelo: todavía no se manda el DELETE.
    expect(api.darDeBaja).not.toHaveBeenCalled();

    terminarRegistro();
    await Promise.all([reRegistro, baja]);

    expect(api.darDeBaja).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/a');
    const [registro] = api.registrar.mock.invocationCallOrder;
    const [delete_] = api.darDeBaja.mock.invocationCallOrder;
    expect(registro).toBeLessThan(delete_ ?? 0);
  });

  it('la espera al re-registro también cuenta dentro del tope', async () => {
    const actual = suscripcion('https://fcm.googleapis.com/fcm/send/a', CLAVE);
    const nav = navegador({ permiso: 'granted', actual });
    const api = servidor();
    let soltar!: () => void;
    api.registrar.mockReturnValue(new Promise<void>((r) => (soltar = r)));

    const reRegistro = reRegistrarPushAlIniciarSesion(nav, api);
    await vi.waitFor(() => expect(api.registrar).toHaveBeenCalledTimes(1));
    const inicio = Date.now();
    await bajaDePushAlCerrarSesion(30, nav, api);

    expect(Date.now() - inicio).toBeLessThan(1_000);
    // No dejar un re-registro colgado para los tests siguientes.
    soltar();
    await reRegistro;
  });
});
