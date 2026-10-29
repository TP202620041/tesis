import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { colaDeReportes } from '@/pwa/colaReportes';
import type { ReporteEnCola } from '../model/colaOffline';
import type { NuevoReporte, ReporteCreado } from '../model/tipos';
import {
  comoNuevoReporte,
  completarEnCola,
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
    titulo: 'Bache profundo en la berma',
    severidad: 'ALTA',
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
    titulo: 'Bache profundo en la berma',
    severidad: 'ALTA',
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
      datos: {
        categoriaId: 2,
        titulo: 'Bache profundo en la berma',
        severidad: 'ALTA',
        descripcion: 'Bache profundo',
        ubicacionManual: false,
      },
    });

    // Al reenviar se rearma el mismo multipart: misma clave, misma foto.
    const reenvio = comoNuevoReporte(guardado)!;
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

  it('un 403 TERMINOS_PENDIENTES no es un rechazo: queda pendiente y se detiene (NC-07b)', async () => {
    await encolar('k1');
    await encolar('k2');
    const enviar = vi
      .fn()
      .mockRejectedValue(new ApiError(403, 'Debes aceptar los terminos', '', [], 'TERMINOS_PENDIENTES'));

    const resultado = await sincronizarCola(ANA, 1, undefined, deps(enviar));

    expect(resultado.detenidaPor).toBe('sin-sesion');
    expect(enviar).toHaveBeenCalledTimes(1);
    const cola = await colaDeReportes.listar();
    expect(cola.map((r) => r.estado)).toEqual(['pendiente', 'pendiente']);
  });

  it('un 403 sin código sigue siendo un rechazo', async () => {
    await encolar('k1');
    const enviar = vi.fn().mockRejectedValue(new ApiError(403, 'Sin permiso'));
    await sincronizarCola(ANA, 1, undefined, deps(enviar));
    expect((await colaDeReportes.listar())[0]).toMatchObject({ estado: 'rechazado' });
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

  describe('la moderación (NC-10c)', () => {
    const conFoto = () => new File(['bytes'], 'bache.jpg', { type: 'image/jpeg' });

    it('400 FOTO_NO_PERMITIDA: queda rechazado con un motivo que se puede seguir, y sigue con el resto', async () => {
      await encolar('k1', ANA, en(0), conFoto());
      await encolar('k2', ANA, en(1));
      const enviar = vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError(400, 'La foto no está permitida. Toma otra.', '/api/reportes', ['foto'], 'FOTO_NO_PERMITIDA'),
        )
        .mockResolvedValueOnce(creado(44));

      const resultado = await sincronizarCola(ANA, 1, undefined, deps(enviar, { ahora: en(2) }));

      expect(resultado).toEqual({ enviados: [creado(44)], detenidaPor: null });
      const cola = await colaDeReportes.listar();
      expect(cola).toHaveLength(1);
      expect(cola[0]).toMatchObject({
        idempotencyKey: 'k1',
        estado: 'rechazado',
        motivo:
          'La foto no está permitida. Descártalo y vuelve a reportar el daño con otra foto o sin ella.',
      });
      // Se conserva (con su foto) hasta que el ciudadano lo descarte.
      expect(cola[0]?.foto).not.toBeNull();

      // Un rechazado no se reintenta solo.
      const otra = vi.fn();
      await sincronizarCola(ANA, 1, undefined, deps(otra, { ahora: en(3) }));
      expect(otra).not.toHaveBeenCalled();
    });

    it('400 TEXTO_NO_PERMITIDO: queda rechazado, el motivo nombra el campo y no repite la palabra', async () => {
      await encolar('k1');
      const enviar = vi
        .fn()
        .mockRejectedValue(
          new ApiError(
            400,
            'La descripción tiene palabras que no están permitidas. Cámbiala para continuar.',
            '/api/reportes',
            ['descripcion'],
            'TEXTO_NO_PERMITIDO',
          ),
        );

      await sincronizarCola(ANA, 1, undefined, deps(enviar));

      expect((await colaDeReportes.listar())[0]).toMatchObject({
        estado: 'rechazado',
        motivo:
          'La descripción tiene palabras que no están permitidas. Descártalo y vuelve a reportar el daño sin ellas.',
      });
    });

    it('503 MODERACION_NO_DISPONIBLE: sigue pendiente con la MISMA clave y se reintenta luego', async () => {
      await encolar('k1', ANA, en(0), conFoto());
      const caida = vi
        .fn()
        .mockRejectedValue(
          new ApiError(503, 'No pudimos revisar la foto…', '/api/reportes', [], 'MODERACION_NO_DISPONIBLE'),
        );

      expect((await sincronizarCola(ANA, 1, undefined, deps(caida))).detenidaPor).toBe('sin-conexion');
      expect((await colaDeReportes.listar())[0]).toMatchObject({ idempotencyKey: 'k1', estado: 'pendiente' });

      // Con el servicio de vuelta, el mismo reporte sale con su clave y su foto.
      const conServicio = vi.fn().mockResolvedValue(creado(45));
      await sincronizarCola(ANA, 1, undefined, deps(conServicio, { ahora: en(1) }));
      expect(conServicio).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'k1', foto: expect.any(File) }),
      );
      expect(await claves()).toEqual([]);
    });
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

/**
 * NC-02: un reporte guardado por la version anterior del formulario, sin
 * titulo ni severidad (se escribe directo en IndexedDB, como lo dejo esa
 * version: sin esos campos y sin ningun marcador nuevo).
 */
async function guardarIncompleto(clave: string, usuarioId = ANA, ahora = en(0)) {
  const { latitud, longitud, categoriaId, descripcion, ubicacionManual } = nuevo(clave);
  const viejo: ReporteEnCola = {
    idempotencyKey: clave,
    usuarioId,
    creadoEn: ahora().toISOString(),
    datos: { latitud, longitud, categoriaId, descripcion, ubicacionManual },
    foto: null,
    estado: 'pendiente',
    motivo: null,
  };
  await colaDeReportes.guardar(viejo);
}

describe('reportes incompletos (NC-02)', () => {
  it('un incompleto NUNCA se envia sin completar, aunque este pendiente', async () => {
    await guardarIncompleto('viejo');
    await encolar('completo', ANA, en(1));
    const enviar = vi.fn().mockResolvedValue(creado(50));

    const resultado = await sincronizarCola(ANA, 1, undefined, deps(enviar, { ahora: en(2) }));

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'completo' }));
    expect(resultado).toEqual({ enviados: [creado(50)], detenidaPor: null });
    // El incompleto sigue en la cola, intacto.
    expect(await claves()).toEqual(['viejo']);
    expect((await colaDeReportes.listar())[0]).toMatchObject({ estado: 'pendiente', motivo: null });
  });

  it('comoNuevoReporte no puede armar la peticion de un incompleto', async () => {
    await guardarIncompleto('viejo');
    expect(comoNuevoReporte((await colaDeReportes.listar())[0]!)).toBeNull();
  });

  it('completarlo conserva la MISMA clave y la fecha, y entonces se envia con esa clave', async () => {
    await guardarIncompleto('clave-original');

    const error = await completarEnCola(
      'clave-original',
      { titulo: '  Bache en Miraflores  ', severidad: 'MEDIA' },
      { almacen: colaDeReportes },
    );

    expect(error).toBeNull();
    const [completado] = await colaDeReportes.listar();
    expect(completado).toMatchObject({
      idempotencyKey: 'clave-original',
      creadoEn: en(0)().toISOString(),
      estado: 'pendiente',
      datos: { categoriaId: 2, titulo: 'Bache en Miraflores', severidad: 'MEDIA' },
    });

    const enviar = vi.fn().mockResolvedValue(creado(51));
    await sincronizarCola(ANA, 1, undefined, deps(enviar, { ahora: en(1) }));

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'clave-original',
        titulo: 'Bache en Miraflores',
        severidad: 'MEDIA',
      }),
    );
    expect(await claves()).toEqual([]);
  });

  it('completar valida como el backend y no toca la cola si es invalido', async () => {
    await guardarIncompleto('viejo');
    const completar = (titulo: string, severidad: 'BAJA' | null) =>
      completarEnCola('viejo', { titulo, severidad }, { almacen: colaDeReportes });

    expect(await completar('   ab   ', 'BAJA')).toMatch(/al menos 5/);
    expect(await completar('x'.repeat(121), 'BAJA')).toMatch(/como máximo 120/);
    expect(await completar('Bache en Surco', null)).toBe('Elige la severidad del daño.');
    expect((await colaDeReportes.listar())[0]?.datos.titulo).toBeUndefined();
  });

  it('completar un reporte que ya no esta (otra pestaña lo envio) no lo resucita', async () => {
    const error = await completarEnCola(
      'no-existe',
      { titulo: 'Bache en Surco', severidad: 'ALTA' },
      { almacen: colaDeReportes },
    );
    expect(error).toMatch(/ya no está por completar/);
    expect(await claves()).toEqual([]);
  });

  it('un incompleto rechazado con 400 (por la version vieja) se completa y vuelve a pendiente', async () => {
    await guardarIncompleto('viejo');
    await colaDeReportes.marcarRechazado('viejo', 'El titulo debe tener entre 5 y 120 caracteres');

    await completarEnCola(
      'viejo',
      { titulo: 'Bache en Surco', severidad: 'BAJA' },
      { almacen: colaDeReportes },
    );

    expect((await colaDeReportes.listar())[0]).toMatchObject({
      idempotencyKey: 'viejo',
      estado: 'pendiente',
      motivo: null,
    });
  });

  it('un 400 de validacion nunca borra el reporte de la cola', async () => {
    await encolar('k1');
    const enviar = vi
      .fn()
      .mockRejectedValue(new ApiError(400, 'El titulo debe tener entre 5 y 120 caracteres'));

    await sincronizarCola(ANA, 1, undefined, deps(enviar));

    expect((await colaDeReportes.listar())[0]).toMatchObject({
      idempotencyKey: 'k1',
      estado: 'rechazado',
      motivo: 'El titulo debe tener entre 5 y 120 caracteres',
    });
  });

  it('un incompleto no se purga aunque pasen 30 dias', async () => {
    await guardarIncompleto('viejo');

    await sincronizarCola(ANA, 1, undefined, deps(vi.fn(), { ahora: en(40 * 24) }));

    expect(await claves()).toEqual(['viejo']);
  });

  it('un incompleto de mas de 48 h, al completarlo, queda caducado: no se reenvia a ciegas', async () => {
    await guardarIncompleto('viejo');
    await completarEnCola(
      'viejo',
      { titulo: 'Bache en Surco', severidad: 'ALTA' },
      { almacen: colaDeReportes },
    );
    const enviar = vi.fn();

    await sincronizarCola(ANA, 1, undefined, deps(enviar, { ahora: en(49) }));

    expect(enviar).not.toHaveBeenCalled();
    expect(await claves()).toEqual(['viejo']);
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
