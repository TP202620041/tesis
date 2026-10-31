import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { HistorialEntrada } from '@/lib/types/domain';
import { LineaDeTiempo } from './LineaDeTiempo';

const FECHA = '2026-10-29T15:10:00Z';

function entrada(parcial: Partial<HistorialEntrada>): HistorialEntrada {
  return { id: 1, tipoEvento: 'CAMBIO_ESTADO', fecha: FECHA, ...parcial };
}

describe('LineaDeTiempo', () => {
  it('sin movimientos lo dice', () => {
    render(<LineaDeTiempo entradas={[]} />);
    expect(screen.getByText('Todavía no hay movimientos registrados.')).toBeInTheDocument();
  });

  it('US-22: describe el cambio de estado y la asignación', () => {
    render(
      <LineaDeTiempo
        entradas={[
          entrada({ id: 1, estadoAnterior: 'PENDIENTE', estadoNuevo: 'RECIBIDO' }),
          entrada({ id: 2, estadoNuevo: 'PENDIENTE' }),
          entrada({ id: 3, tipoEvento: 'ASIGNACION', comentario: 'Cuadrilla 3', autor: 'Juan' }),
        ]}
      />,
    );
    expect(screen.getByText('Pendiente → Recibido')).toBeInTheDocument();
    expect(screen.getByText('Estado: Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Asignación de responsable')).toBeInTheDocument();
    expect(screen.getByText('Cuadrilla 3')).toBeInTheDocument();
  });

  it.each([
    ['FOTO_OCULTA', 'Foto oculta por moderación'],
    ['REPORTE_OCULTO', 'Reporte oculto por moderación'],
    ['FOTO_RESTABLECIDA', 'Foto restablecida'],
    ['REPORTE_RESTABLECIDO', 'Reporte restablecido'],
  ] as const)('NC-11a: el evento %s se titula «%s» y muestra el motivo', (tipoEvento, titulo) => {
    render(
      <LineaDeTiempo
        entradas={[
          entrada({
            tipoEvento,
            estadoAnterior: undefined,
            estadoNuevo: undefined,
            comentario: 'La foto muestra la placa de un vehículo particular',
            autor: 'Moderación de Ciudad Viva',
          }),
        ]}
      />,
    );
    expect(screen.getByText(titulo)).toBeInTheDocument();
    expect(screen.getByText('La foto muestra la placa de un vehículo particular')).toBeInTheDocument();
    expect(screen.getByText(/Moderación de Ciudad Viva/)).toBeInTheDocument();
    // Un evento de moderacion no es una transicion: nunca «Estado: —».
    expect(screen.queryByText(/Estado:/)).not.toBeInTheDocument();
  });

  it('NC-11a: `avisoIndice` se muestra tal cual, aparte del motivo', () => {
    render(
      <LineaDeTiempo
        entradas={[
          entrada({
            tipoEvento: 'REPORTE_OCULTO',
            comentario: 'Contenido ofensivo',
            avisoIndice: 'Mientras esté oculto, este reporte no cuenta en el índice de desempeño.',
          }),
          entrada({ id: 2, tipoEvento: 'FOTO_OCULTA', comentario: 'Placa visible', avisoIndice: null }),
        ]}
      />,
    );
    expect(
      screen.getByText('Mientras esté oculto, este reporte no cuenta en el índice de desempeño.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Contenido ofensivo')).toBeInTheDocument();
    // Solo una vez: la foto oculta no trae aviso del indice.
    expect(screen.getAllByText(/índice de desempeño/)).toHaveLength(1);
  });
});
