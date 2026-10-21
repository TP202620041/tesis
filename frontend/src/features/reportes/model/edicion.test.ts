import { describe, expect, it } from 'vitest';
import type { CategoriaDano } from '@/lib/types/domain';
import {
  cambiosDeEdicion,
  errorDeEdicion,
  etiquetaDeOpcion,
  opcionesDeCategoria,
} from './edicion';

const CATALOGO: CategoriaDano[] = [
  { id: 1, nombre: 'Bache', esEstandar: true },
  { id: 57, nombre: 'Malecon erosionado', esEstandar: false },
];

describe('opcionesDeCategoria', () => {
  it('si la categoría actual se ofrece, devuelve el catálogo tal cual', () => {
    expect(opcionesDeCategoria(CATALOGO, { id: 1, nombre: 'Bache' }).map((o) => o.id)).toEqual([1, 57]);
  });

  it('agrega al principio la categoría desactivada del reporte, marcada', () => {
    const opciones = opcionesDeCategoria(CATALOGO, { id: 58, nombre: 'Ciclovia obstruida' });
    expect(opciones[0]).toEqual({ id: 58, nombre: 'Ciclovia obstruida', noOfrecida: true });
    expect(etiquetaDeOpcion(opciones[0]!)).toBe('Ciclovia obstruida (ya no se ofrece)');
    expect(opciones).toHaveLength(3);
  });

  it('con el catálogo aún vacío muestra la actual sin marcarla', () => {
    expect(opcionesDeCategoria([], { id: 1, nombre: 'Bache' })).toEqual([
      { id: 1, nombre: 'Bache', noOfrecida: false },
    ]);
  });
});

describe('cambiosDeEdicion', () => {
  const ORIGINAL = { categoriaId: 58, titulo: 'Bache en la ciclovía', severidad: 'MEDIA' };
  const SIN_CAMBIOS = {
    categoriaId: 58,
    titulo: 'Bache en la ciclovía',
    severidad: 'MEDIA' as const,
    descripcion: 'Más detalle',
  };

  it('no reenvía categoría, título ni severidad si el ciudadano no los cambió', () => {
    expect(cambiosDeEdicion(ORIGINAL, SIN_CAMBIOS)).toEqual({ descripcion: 'Más detalle' });
  });

  it('envía la categoría nueva cuando cambió', () => {
    expect(cambiosDeEdicion(ORIGINAL, { ...SIN_CAMBIOS, categoriaId: 1, descripcion: 'x' })).toEqual({
      categoriaId: 1,
      descripcion: 'x',
    });
  });

  it('NC-02: envía el título recortado y la severidad solo si cambiaron', () => {
    expect(
      cambiosDeEdicion(ORIGINAL, { ...SIN_CAMBIOS, titulo: '  Bache en la ciclovía  ' }),
    ).toEqual({ descripcion: 'Más detalle' });
    expect(
      cambiosDeEdicion(ORIGINAL, { ...SIN_CAMBIOS, titulo: ' Bache grande ', severidad: 'ALTA' }),
    ).toEqual({ titulo: 'Bache grande', severidad: 'ALTA', descripcion: 'Más detalle' });
  });
});

describe('errorDeEdicion (NC-02)', () => {
  it('valida el título solo si se va a enviar', () => {
    expect(errorDeEdicion({ descripcion: 'x' })).toBeNull();
    expect(errorDeEdicion({ titulo: 'Bache', descripcion: 'x' })).toBeNull();
    expect(errorDeEdicion({ titulo: '', descripcion: 'x' })).toBe('Escribe un título para el reporte.');
    expect(errorDeEdicion({ titulo: 'x'.repeat(121), descripcion: 'x' })).toMatch(/como máximo 120/);
  });
});
