import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReporteEnCola } from '@/features/reportes/model/colaOffline';
import { colaDeReportes } from './colaReportes';

/**
 * jsdom no trae IndexedDB: `fake-indexeddb` lo implementa en memoria con la
 * misma API (y el mismo clonado estructurado), asi que aqui se prueba el
 * adaptador real, no un doble.
 */
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

function reporte(clave: string, foto: ReporteEnCola['foto'] = null): ReporteEnCola {
  return {
    idempotencyKey: clave,
    usuarioId: 7,
    creadoEn: '2026-10-19T10:00:00.000Z',
    datos: {
      latitud: -12.1,
      longitud: -77.0,
      categoriaId: 1,
      titulo: 'Bache en Miraflores',
      severidad: 'ALTA',
      ubicacionManual: true,
    },
    foto,
    estado: 'pendiente',
    motivo: null,
  };
}

describe('colaDeReportes (IndexedDB)', () => {
  it('guarda, lista y quita por Idempotency-Key', async () => {
    await colaDeReportes.guardar(reporte('k1'));
    await colaDeReportes.guardar(reporte('k2'));

    expect((await colaDeReportes.listar()).map((r) => r.idempotencyKey).sort()).toEqual([
      'k1',
      'k2',
    ]);

    await colaDeReportes.quitar('k1');
    expect((await colaDeReportes.listar()).map((r) => r.idempotencyKey)).toEqual(['k2']);
  });

  it('conserva la foto (bytes, nombre y tipo) para rearmar el multipart', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    await colaDeReportes.guardar(
      reporte('k1', { contenido: bytes.buffer, nombre: 'bache.jpg', tipo: 'image/jpeg' }),
    );

    const leido = (await colaDeReportes.listar())[0]!;
    expect(leido.foto?.nombre).toBe('bache.jpg');
    expect(leido.foto?.tipo).toBe('image/jpeg');
    expect(Array.from(new Uint8Array(leido.foto!.contenido))).toEqual(Array.from(bytes));
  });

  it('guardar con la misma clave reemplaza (no duplica)', async () => {
    await colaDeReportes.guardar(reporte('k1'));
    await colaDeReportes.guardar({ ...reporte('k1'), estado: 'rechazado', motivo: 'Fuera de Lima' });

    const cola = await colaDeReportes.listar();
    expect(cola).toHaveLength(1);
    expect(cola[0]?.estado).toBe('rechazado');
  });

  it('completar (NC-02) agrega titulo y severidad con la MISMA clave y fecha, y lo deja pendiente', async () => {
    const sinCampos = { ...reporte('k1').datos };
    delete sinCampos.titulo;
    delete sinCampos.severidad;
    await colaDeReportes.guardar({
      ...reporte('k1'),
      datos: sinCampos,
      estado: 'rechazado',
      motivo: 'El titulo debe tener entre 5 y 120 caracteres',
    });

    const completado = await colaDeReportes.completar('k1', {
      titulo: 'Bache en Surco',
      severidad: 'BAJA',
    });

    expect(completado).toBe(true);
    const cola = await colaDeReportes.listar();
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({
      idempotencyKey: 'k1',
      creadoEn: '2026-10-19T10:00:00.000Z',
      estado: 'pendiente',
      motivo: null,
      datos: { categoriaId: 1, titulo: 'Bache en Surco', severidad: 'BAJA', ubicacionManual: true },
    });
  });

  it('completar una clave que ya no esta no la resucita', async () => {
    expect(
      await colaDeReportes.completar('no-existe', { titulo: 'Bache en Surco', severidad: 'ALTA' }),
    ).toBe(false);
    expect(await colaDeReportes.listar()).toEqual([]);
  });

  it('avisa a los suscriptores en cada cambio', async () => {
    const alCambiar = vi.fn();
    const desuscribir = colaDeReportes.suscribir(alCambiar);

    await colaDeReportes.guardar(reporte('k1'));
    await colaDeReportes.quitar('k1');
    desuscribir();
    await colaDeReportes.guardar(reporte('k2'));

    expect(alCambiar).toHaveBeenCalledTimes(2);
  });
});
