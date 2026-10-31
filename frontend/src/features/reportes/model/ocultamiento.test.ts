import { describe, expect, it } from 'vitest';
import type { HistorialEntrada } from '@/lib/types/domain';
import { estadoDeOcultamiento, SIN_OCULTAMIENTO } from './ocultamiento';

const evento = (id: number, tipoEvento: string): HistorialEntrada => ({ id, tipoEvento });

describe('estadoDeOcultamiento (NC-11b)', () => {
  it('sin eventos de moderación no hay nada oculto', () => {
    expect(estadoDeOcultamiento([])).toEqual(SIN_OCULTAMIENTO);
    expect(
      estadoDeOcultamiento([evento(1, 'CAMBIO_ESTADO'), evento(2, 'ASIGNACION')]),
    ).toEqual(SIN_OCULTAMIENTO);
  });

  it('el último evento de cada par decide', () => {
    expect(estadoDeOcultamiento([evento(1, 'REPORTE_OCULTO')])).toEqual({
      reporteOculto: true,
      fotoOculta: false,
    });
    expect(
      estadoDeOcultamiento([evento(1, 'REPORTE_OCULTO'), evento(2, 'REPORTE_RESTABLECIDO')]),
    ).toEqual(SIN_OCULTAMIENTO);
    expect(
      estadoDeOcultamiento([
        evento(1, 'REPORTE_OCULTO'),
        evento(2, 'REPORTE_RESTABLECIDO'),
        evento(3, 'REPORTE_OCULTO'),
      ]),
    ).toEqual({ reporteOculto: true, fotoOculta: false });
  });

  it('la foto y el reporte se ocultan por separado', () => {
    expect(
      estadoDeOcultamiento([evento(1, 'FOTO_OCULTA'), evento(2, 'CAMBIO_ESTADO')]),
    ).toEqual({ reporteOculto: false, fotoOculta: true });
    expect(
      estadoDeOcultamiento([evento(1, 'FOTO_OCULTA'), evento(2, 'REPORTE_OCULTO')]),
    ).toEqual({ reporteOculto: true, fotoOculta: true });
    expect(
      estadoDeOcultamiento([
        evento(1, 'FOTO_OCULTA'),
        evento(2, 'REPORTE_OCULTO'),
        evento(3, 'FOTO_RESTABLECIDA'),
      ]),
    ).toEqual({ reporteOculto: true, fotoOculta: false });
  });
});
