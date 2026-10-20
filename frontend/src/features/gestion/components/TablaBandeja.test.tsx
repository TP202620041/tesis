import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReporteGestion } from '../model/tipos';
import { ordenar, TablaBandeja } from './TablaBandeja';

function reporte(id: number, extra: Partial<ReporteGestion> = {}): ReporteGestion {
  return {
    id,
    estado: 'PENDIENTE',
    categoriaNombre: `Categoria ${id}`,
    totalAdhesiones: 1,
    createdAt: '2026-10-01T12:00:00Z',
    posibleReincidencia: false,
    ...extra,
  };
}

describe('TablaBandeja (SEC-02: la señal interna solo vive en la bandeja)', () => {
  it('marca los reportes con posible reincidencia y no los demás', () => {
    render(
      <TablaBandeja
        reportes={[reporte(1, { posibleReincidencia: true }), reporte(2)]}
        orden="recientes"
        onOrdenar={vi.fn()}
      />,
    );
    const [conSenal, sinSenal] = screen.getAllByRole('link');
    expect(conSenal).toHaveTextContent('Posible reincidencia');
    expect(sinSenal).not.toHaveTextContent(/reincidencia/i);
  });

  it('ordena por apoyos y desempata por el más antiguo', () => {
    const ordenados = ordenar(
      [
        reporte(1, { totalAdhesiones: 2, createdAt: '2026-10-03T00:00:00Z' }),
        reporte(2, { totalAdhesiones: 5 }),
        reporte(3, { totalAdhesiones: 2, createdAt: '2026-10-02T00:00:00Z' }),
      ],
      'apoyos',
    );
    expect(ordenados.map((r) => r.id)).toEqual([2, 3, 1]);
  });
});
