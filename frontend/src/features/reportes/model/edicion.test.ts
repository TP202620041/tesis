import { describe, expect, it } from 'vitest';
import type { CategoriaDano } from '@/lib/types/domain';
import { cambiosDeEdicion, etiquetaDeOpcion, opcionesDeCategoria } from './edicion';

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
  it('no reenvía la categoría si el ciudadano no la cambió', () => {
    expect(cambiosDeEdicion(58, 58, 'Más detalle')).toEqual({ descripcion: 'Más detalle' });
  });

  it('envía la categoría nueva cuando cambió', () => {
    expect(cambiosDeEdicion(58, 1, 'x')).toEqual({ categoriaId: 1, descripcion: 'x' });
  });
});
