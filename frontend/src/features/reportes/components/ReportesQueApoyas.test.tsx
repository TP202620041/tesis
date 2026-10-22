import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReportesQueApoyas } from '../hooks/useReportesQueApoyas';
import type { ReporteResumen } from '../model/tipos';
import { ReportesQueApoyas } from './ReportesQueApoyas';

vi.mock('../hooks/useReportesQueApoyas', () => ({ useReportesQueApoyas: vi.fn() }));

type Carga = ReturnType<typeof useReportesQueApoyas>;

const EN_PROCESO: ReporteResumen = {
  id: 184,
  estado: 'EN_PROCESO',
  titulo: 'Bache frente al parque',
  categoriaNombre: 'Bache',
  severidad: 'MEDIA',
  distritoNombre: 'Miraflores',
  totalAdhesiones: 3,
  createdAt: '2026-10-20T15:02:11Z',
};
const CANCELADO: ReporteResumen = {
  id: 190,
  estado: 'CANCELADO',
  titulo: 'Semáforo apagado',
  categoriaNombre: 'Semáforo averiado',
  distritoNombre: 'Surco',
  totalAdhesiones: 2,
};

const recargar = vi.fn();

function conCarga(carga: Partial<Carga>) {
  vi.mocked(useReportesQueApoyas).mockReturnValue({
    estado: 'listo',
    datos: [],
    error: null,
    recargar,
    recargando: false,
    ...carga,
  } as Carga);
}

beforeEach(() => {
  recargar.mockReset();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ReportesQueApoyas (QA-1 M-6)', () => {
  it('es una sección con su propio título', () => {
    conCarga({ datos: [EN_PROCESO] });
    render(<ReportesQueApoyas arribaYaCargo />);

    const seccion = screen.getByRole('region', { name: 'Reportes que apoyas' });
    expect(within(seccion).getByRole('heading', { level: 2, name: 'Reportes que apoyas' })).toBeInTheDocument();
  });

  it('cada reporte muestra título y estado, y enlaza a su detalle PÚBLICO', () => {
    conCarga({ datos: [EN_PROCESO] });
    render(<ReportesQueApoyas arribaYaCargo />);

    const enlace = screen.getByRole('link', { name: /Bache frente al parque/ });
    expect(enlace).toHaveAttribute('href', '/reportes/184');
    expect(within(enlace).getByText('En proceso')).toBeInTheDocument();
    expect(within(enlace).getByText(/3 vecinos/)).toBeInTheDocument();
  });

  it('es de solo lectura: no ofrece editar, retirar ni calificar', () => {
    conCarga({ datos: [EN_PROCESO, CANCELADO] });
    render(<ReportesQueApoyas arribaYaCargo />);

    expect(screen.queryByRole('button', { name: /editar|retirar|calificar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /editar|retirar|calificar/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="/mis-reportes/"]')).toBeNull();
  });

  it('un CANCELADO no enlaza (su detalle público da 404) y explica por qué', () => {
    conCarga({ datos: [CANCELADO] });
    render(<ReportesQueApoyas arribaYaCargo />);

    expect(screen.getByText('Semáforo apagado')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/El vecino que lo creó lo retiró/)).toBeInTheDocument();
  });

  it('sin apoyos muestra el estado vacío que explica cómo se llega aquí', () => {
    conCarga({ datos: [] });
    render(<ReportesQueApoyas arribaYaCargo />);

    expect(screen.getByText('Todavía no apoyas reportes de otros vecinos')).toBeInTheDocument();
    expect(screen.getByText(/te sumas a su reporte/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('mientras carga lo dice y marca la sección como ocupada', () => {
    conCarga({ estado: 'cargando', datos: null } as Partial<Carga>);
    render(<ReportesQueApoyas arribaYaCargo />);

    expect(screen.getByText('Cargando los reportes que apoyas…')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Reportes que apoyas' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Todavía no apoyas reportes de otros vecinos')).not.toBeInTheDocument();
  });

  it('si falla lo anuncia en la sección y permite reintentar', async () => {
    conCarga({
      estado: 'error',
      datos: null,
      error: { mensaje: 'Fallo', detalles: [] },
    } as unknown as Partial<Carga>);
    render(<ReportesQueApoyas arribaYaCargo />);

    expect(screen.getByRole('status')).toHaveTextContent('No se pudieron cargar los reportes que apoyas.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  describe('llegada desde la confirmación de una adhesión (#reportes-que-apoyas)', () => {
    it('lleva el foco al título cuando la página ya cargó', () => {
      window.history.replaceState(null, '', '/mis-reportes#reportes-que-apoyas');
      conCarga({ datos: [EN_PROCESO] });
      render(<ReportesQueApoyas arribaYaCargo />);

      expect(screen.getByRole('heading', { name: 'Reportes que apoyas' })).toHaveFocus();
    });

    it('espera a que cargue lo de arriba, que movería la sección', () => {
      window.history.replaceState(null, '', '/mis-reportes#reportes-que-apoyas');
      conCarga({ datos: [EN_PROCESO] });
      const { rerender } = render(<ReportesQueApoyas arribaYaCargo={false} />);
      const titulo = screen.getByRole('heading', { name: 'Reportes que apoyas' });
      expect(titulo).not.toHaveFocus();

      rerender(<ReportesQueApoyas arribaYaCargo />);
      expect(titulo).toHaveFocus();
    });

    it('sin el ancla en la URL no mueve el foco', () => {
      conCarga({ datos: [EN_PROCESO] });
      render(<ReportesQueApoyas arribaYaCargo />);

      expect(screen.getByRole('heading', { name: 'Reportes que apoyas' })).not.toHaveFocus();
    });
  });
});
