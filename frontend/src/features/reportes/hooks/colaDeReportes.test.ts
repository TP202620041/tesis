import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { colaDeReportes } from '@/pwa/colaReportes';
import type { NuevoReporte, ReporteCreado } from '../model/tipos';
import {
  comoNuevoReporte,
  descartarDeLaCola,
  encolarReporte,
  sincronizarCola,
  type Dependencias,
} from './colaDeReportes';

vi.mock('../api', () => ({ crearReporte: vi.fn() }));

const ANA = 7;
const LUIS = 8;
const AHORA = () => new Date('2026-10-19T10:00:00.000Z');

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

/** Con el almacen REAL sobre fake-indexeddb y un `enviar` simulado. */
function deps(enviar: Dependencias['enviar']): Dependencias {
  return { almacen: colaDeReportes, enviar, ahora: AHORA };
}

const claves = async () => (await colaDeReportes.listar()).map((r) => r.idempotencyKey).sort();

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('encolarReporte', () => {
  it('guarda el reporte con su Idempotency-Key, su usuario y la foto', async () => {
    const foto = new File([new Uint8Array([1, 2, 3])], 'bache.jpg', { type: 'image/jpeg' });

    await encolarReporte(nuevo('clave-1', foto), ANA, { almacen: colaDeReportes, ahora: AHORA });

    const guardado = (await colaDeReportes.listar())[0]!;
    expect(guardado).toMatchObject({
      idempotencyKey: 'clave-1',
      usuarioId: ANA,
      creadoEn: '2026-10-19T10:00:00.000Z',
      estado: 'pendiente',
      datos: { categoriaId: 2, descripcion: 'Bache profundo', ubicacionManual: false },
    });
    expect(guardado.foto?.nombre).toBe('bache.jpg');

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
    await encolarReporte(nuevo('k1'), ANA, deps(vi.fn()));
    const enviar = vi.fn().mockResolvedValue(creado(41));

    const resultado = await sincronizarCola(ANA, deps(enviar));

    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'k1' }));
    expect(resultado).toEqual({ enviados: [creado(41)], detenidaPor: null });
    expect(await claves()).toEqual([]);
  });

  it('sin red conserva el reporte y se detiene', async () => {
    await encolarReporte(nuevo('k1'), ANA, deps(vi.fn()));
    await encolarReporte(nuevo('k2'), ANA, deps(vi.fn()));
    const enviar = vi.fn().mockRejectedValue(new NetworkError());

    const resultado = await sincronizarCola(ANA, deps(enviar));

    expect(resultado.detenidaPor).toBe('sin-conexion');
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(await claves()).toEqual(['k1', 'k2']);
  });

  it('un 401 (sesion vencida) conserva el reporte pendiente', async () => {
    await encolarReporte(nuevo('k1'), ANA, deps(vi.fn()));
    const enviar = vi.fn().mockRejectedValue(new ApiError(401, 'Sesión expirada'));

    const resultado = await sincronizarCola(ANA, deps(enviar));

    expect(resultado.detenidaPor).toBe('sin-sesion');
    const [sigue] = await colaDeReportes.listar();
    expect(sigue).toMatchObject({ idempotencyKey: 'k1', estado: 'pendiente' });

    // Tras volver a iniciar sesion, el mismo reporte se envia y sale de la cola.
    const conSesion = vi.fn().mockResolvedValue(creado(42));
    await sincronizarCola(ANA, deps(conSesion));
    expect(conSesion).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'k1' }));
    expect(await claves()).toEqual([]);
  });

  it('un 5xx se trata como falta de conexion: se reintenta luego', async () => {
    await encolarReporte(nuevo('k1'), ANA, deps(vi.fn()));
    const enviar = vi.fn().mockRejectedValue(new ApiError(503, 'No disponible'));

    expect((await sincronizarCola(ANA, deps(enviar))).detenidaPor).toBe('sin-conexion');
    expect(await claves()).toEqual(['k1']);
  });

  it('un rechazo de negocio (409) lo marca rechazado con el motivo y sigue con el resto', async () => {
    await encolarReporte(nuevo('k1'), ANA, deps(vi.fn()));
    await encolarReporte(nuevo('k2'), ANA, { almacen: colaDeReportes, ahora: () => new Date('2026-10-19T11:00:00.000Z') });
    const enviar = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, 'La ubicación está fuera de Lima Metropolitana'))
      .mockResolvedValueOnce(creado(43));

    const resultado = await sincronizarCola(ANA, deps(enviar));

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
    await sincronizarCola(ANA, deps(otra));
    expect(otra).not.toHaveBeenCalled();
    await descartarDeLaCola('k1', { almacen: colaDeReportes });
    expect(await claves()).toEqual([]);
  });

  it('solo envia los reportes del usuario con sesion (dispositivo compartido)', async () => {
    await encolarReporte(nuevo('de-ana'), ANA, deps(vi.fn()));
    await encolarReporte(nuevo('de-luis'), LUIS, deps(vi.fn()));
    const enviar = vi.fn().mockResolvedValue(creado(44));

    await sincronizarCola(LUIS, deps(enviar));

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'de-luis' }));
    expect(await claves()).toEqual(['de-ana']);
  });

  it('dos disparos simultaneos comparten una sola sincronizacion (no reenvia dos veces)', async () => {
    await encolarReporte(nuevo('k1'), ANA, deps(vi.fn()));
    const enviar = vi.fn().mockResolvedValue(creado(45));

    const [a, b] = await Promise.all([
      sincronizarCola(ANA, deps(enviar)),
      sincronizarCola(ANA, deps(enviar)),
    ]);

    expect(a).toBe(b);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});
