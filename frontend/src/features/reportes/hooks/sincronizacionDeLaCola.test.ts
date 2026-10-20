import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { colaDeReportes } from '@/pwa/colaReportes';
import type { NuevoReporte, ReporteCreado } from '../model/tipos';
import {
  comoNuevoReporte,
  descartarDeLaCola,
  descartarTodosDe,
  encolarReporte,
  reencolarConClaveNueva,
  sincronizarCola,
  type Dependencias,
} from './useColaOffline';

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  crearReporte: vi.fn(),
}));

const ANA = 7;
const LUIS = 8;
const HORA = 60 * 60 * 1000;
const INICIO = new Date('2026-10-19T10:00:00.000Z');
const en = (horas: number) => () => new Date(INICIO.getTime() + horas * HORA);

function nuevo(clave: string, foto: File | null = null): NuevoReporte {
  return {
    latitud: -12.12,
    longitud: -77.03,
    categoriaId: 2,
    descripcion: 'Bache profundo',
    ubicacionManual: false,
    foto,
    idempotencyKey: clave,
  };
}

function creado(id: number): ReporteCreado {
  return {
    id,
    esAdhesion: false,
    totalAdhesiones: 1,
    distritoNombre: 'Miraflores',
    categoriaNombre: 'Bache',
    fotoUrl: null,
  };
}

/** Almacen REAL sobre fake-indexeddb, `enviar` simulado y sesion fija. */
function deps(enviar: Dependencias['enviar'], extra: Partial<Dependencias> = {}): Dependencias {
  return { almacen: colaDeReportes, enviar, ahora: en(0), generacion: () => 1, ...extra };
}

const encolar = (clave: string, usuarioId = ANA, ahora = en(0), foto: File | null = null) =>
  encolarReporte(nuevo(clave, foto), usuarioId, { almacen: colaDeReportes, ahora });

const claves = async () => (await colaDeReportes.listar()).map((r) => r.idempotencyKey).sort();

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('encolarReporte', () => {
  it('guarda el reporte con su Idempotency-Key, su usuario y la foto', async () => {
    const foto = new File([new Uint8Array([1, 2, 3])], 'bache.jpg', { type: 'image/jpeg' });

    await encolar('clave-1', ANA, en(0), foto);

    const guardado = (await colaDeReportes.listar())[0]!;
    expect(guardado).toMatchObject({
      idempotencyKey: 'clave-1',
      usuarioId: ANA,
      creadoEn: INICIO.toISOString(),
      estado: 'pendiente',
      datos: { categoriaId: 2, descripcion: 'Bache profundo', ubicacionManual: false },
    });

    // Al reenviar se rearma el mismo multipart: misma clave, misma foto.
    const reenvio = comoNuevoReporte(guardado);
    expect(reenvio.idempotencyKey).toBe('clave-1');
    expect(reenvio.foto?.name).toBe('bache.jpg');
    expect(reenvio.foto?.type).toBe('image/jpeg');
    expect(Array.from(new Uint8Array(await reenvio.foto!.arrayBuffer()))).toEqual([1, 2, 3]);
  });
});

describe('sincronizarCola', () => {
  it('reenvia con la MISMA clave y borra de la cola lo que se envio', async () => {
    await encolar('k1');
    const enviar = vi.fn().mockResolvedValue(creado(41));

    const resultado = await sincronizarCola(ANA, 1, undefined, deps(enviar));

    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'k1' }));
    expect(resultado).toEqual({ enviados: [creado(41)], detenidaPor: null });
    expect(await claves()).toEqual([]);
  });

  it('sin red conserva el reporte y se detiene', async () => {
    await encolar('k1');
    await encolar('k2', ANA, en(1));
    const enviar = vi.fn().mockRejectedValue(new NetworkError());

    const resultado = await sincronizarCola(ANA, 1, undefined, deps(enviar, { ahora: en(2) }));

    expect(resultado.detenidaPor).toBe('sin-conexion');
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await claves()).toEqual(['k1', 'k2']);
  });

  it('un 401 (sesion vencida) conserva el reporte pendiente', async () => {
    await encolar('k1');
    const enviar = vi.fn().mockRejectedValue(new ApiError(401, 'Sesión expirada'));

    const resultado = await sincronizarCola(ANA, 1, undefined, deps(enviar));

    expect(resultado.detenidaPor).toBe('sin-sesion');
    expect((await colaDeReportes.listar())[0]).toMatchObject({ idempotencyKey: 'k1', estado: 'pendiente' });

    // Tras volver a iniciar sesion, el mismo reporte se envia y sale de la cola.
    const conSesion = vi.fn().mockResolvedValue(creado(42));
    await sincronizarCola(ANA, 2, undefined, deps(conSesion, { generacion: () => 2 }));
    expect(conSesion).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'k1' }));
    expect(await claves()).toEqual([]);
  });

  it.each([503, 408, 429])('un %i es transitorio: se conserva y se reintenta luego', async (status) => {
    await encolar('k1');
    const enviar = vi.fn().mockRejectedValue(new ApiError(status, 'Transitorio'));

    expect((await sincronizarCola(ANA, 1, undefined, deps(enviar))).detenidaPor).toBe('sin-conexion');
    expect((await colaDeReportes.listar())[0]?.estado).toBe('pendiente');
  });

  it('un rechazo de negocio (409) lo marca rechazado con el motivo y sigue con el resto', async () => {
    await encolar('k1');
    await encolar('k2', ANA, en(1));
    const enviar = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, 'La ubicación está fuera de Lima Metropolitana'))
      .mockResolvedValueOnce(creado(43));

    const resultado = await sincronizarCola(ANA, 1, undefined, deps(enviar, { ahora: en(2) }));

    expect(resultado.enviados).toEqual([creado(43)]);
    const cola = await colaDeReportes.listar();
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({
      idempotencyKey: 'k1',
      estado: 'rechazado',
      motivo: 'La ubicación está fuera de Lima Metropolitana',
    });

    // Un rechazado no se reintenta solo; el ciudadano lo descarta.
    const otra = vi.fn();
    await sincronizarCola(ANA, 1, undefined, deps(otra, { ahora: en(3) }));
    expect(otra).not.toHaveBeenCalled();
    await descartarDeLaCola('k1', { almacen: colaDeReportes });
    expect(await claves()).toEqual([]);
  });

  it('marcar rechazado no resucita un reporte que otra pestaña ya envio', async () => {
    await encolar('k1');
    const enviar = vi.fn(async () => {
      // Mientras esta peticion esperaba, otra pestaña lo envio y lo quito.
      await colaDeReportes.quitar('k1');
      throw new ApiError(409, 'Ya reportaste este daño');
    });

    await sincronizarCola(ANA, 1, undefined, deps(enviar));

    expect(await claves()).toEqual([]);
  });

  it('solo envia los reportes del usuario con sesion (dispositivo compartido)', async () => {
    await encolar('de-ana');
    await encolar('de-luis', LUIS);
    const enviar = vi.fn().mockResolvedValue(creado(44));

    await sincronizarCola(LUIS, 1, undefined, deps(enviar));

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'de-luis' }));
    expect(await claves()).toEqual(['de-ana']);
  });

  it('si cambia la sesion durante el bucle, no envia el resto', async () => {
    await encolar('k1');
    await encolar('k2', ANA, en(1));
    let generacion = 1;
    const enviar = vi.fn(async () => {
      // Durante el primer envio se cierra la sesion y entra otra persona.
      generacion = 2;
      return creado(45);
    });

    const resultado = await sincronizarCola(
      ANA,
      1,
      undefined,
      deps(enviar, { ahora: en(2), generacion: () => generacion }),
    );

    expect(resultado.detenidaPor).toBe('interrumpida');
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await claves()).toEqual(['k2']);
  });

  it('si la sesion ya no es la identificada al EMPEZAR, no envia nada', async () => {
    await encolar('k1');
    const enviar = vi.fn();

    // Se identifico en la generacion 1, pero cuando arranca ya es la 2.
    const resultado = await sincronizarCola(ANA, 1, undefined, deps(enviar, { generacion: () => 2 }));

    expect(resultado.detenidaPor).toBe('interrumpida');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('una llamada encolada tras una cancelada comprueba la sesion al empezar', async () => {
    await encolar('k1');
    let generacion = 1;
    let soltar!: () => void;
    const primera = new AbortController();
    const enviar = vi.fn(
      () =>
        new Promise<ReporteCreado>((r) => {
          soltar = () => r(creado(49));
        }),
    );
    const d = deps(enviar, { generacion: () => generacion });

    const enVuelo = sincronizarCola(ANA, 1, primera.signal, d);
    await vi.waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    // Se desmonta y, mientras la primera sigue en vuelo, cambia la sesion;
    // la segunda llamada queda encolada detras.
    primera.abort();
    generacion = 2;
    await encolar('k2', ANA, en(1));
    const encolada = sincronizarCola(ANA, 1, undefined, d);
    soltar();

    await enVuelo;
    expect((await encolada).detenidaPor).toBe('interrumpida');
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('si se aborta la señal (desmontaje), no envia el resto', async () => {
    await encolar('k1');
    await encolar('k2', ANA, en(1));
    const control = new AbortController();
    const enviar = vi.fn(async () => {
      control.abort();
      return creado(46);
    });

    const resultado = await sincronizarCola(ANA, 1, control.signal, deps(enviar, { ahora: en(2) }));

    expect(resultado.detenidaPor).toBe('interrumpida');
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('dos disparos simultaneos del mismo usuario comparten una sola sincronizacion', async () => {
    await encolar('k1');
    const enviar = vi.fn().mockResolvedValue(creado(47));

    const [a, b] = await Promise.all([
      sincronizarCola(ANA, 1, undefined, deps(enviar)),
      sincronizarCola(ANA, 1, undefined, deps(enviar)),
    ]);

    expect(a).toBe(b);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

describe('caducidad de la clave (48 h)', () => {
  it('pasadas 48 h no se reenvia a ciegas', async () => {
    await encolar('k1');
    const enviar = vi.fn();

    await sincronizarCola(ANA, 1, undefined, deps(enviar, { ahora: en(49) }));

    expect(enviar).not.toHaveBeenCalled();
    expect(await claves()).toEqual(['k1']);
  });

  it('reenviar con clave nueva lo vuelve a poner pendiente, con otra clave y fecha', async () => {
    await encolar('vieja');
    const [caducado] = await colaDeReportes.listar();

    await reencolarConClaveNueva(caducado!, {
      almacen: colaDeReportes,
      ahora: en(50),
      nuevaClave: () => 'nueva',
    });

    const cola = await colaDeReportes.listar();
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({
      idempotencyKey: 'nueva',
      creadoEn: en(50)().toISOString(),
      estado: 'pendiente',
    });
  });

  it('rechazados y caducados de mas de 30 dias se purgan; los pendientes no', async () => {
    await encolar('caducado-viejo');
    await encolar('rechazado-viejo');
    await colaDeReportes.marcarRechazado('rechazado-viejo', 'Fuera de Lima');
    await encolar('reciente', ANA, en(31 * 24));

    await sincronizarCola(ANA, 1, undefined, deps(vi.fn().mockResolvedValue(creado(48)), {
      ahora: en(31 * 24 + 1),
    }));

    // El reciente se envio; los dos viejos se purgaron.
    expect(await claves()).toEqual([]);
  });
});

describe('descartarTodosDe', () => {
  it('borra solo los reportes de ese usuario', async () => {
    await encolar('de-ana');
    await encolar('de-luis', LUIS);

    await descartarTodosDe(ANA, { almacen: colaDeReportes });

    expect(await claves()).toEqual(['de-luis']);
  });
});
