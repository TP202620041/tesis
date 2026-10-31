import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { HistorialEntrada } from '@/lib/types/domain';
import { useMiReporte } from '../hooks/useMiReporte';
import type { ReporteResumen } from '../model/tipos';
import { DetalleMiReporte } from './DetalleMiReporte';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('../hooks/useMiReporte', () => ({ useMiReporte: vi.fn() }));
vi.mock('./Calificar', () => ({ Calificar: () => null }));
vi.mock('./Comentarios', () => ({ Comentarios: () => null }));
vi.mock('./EditarReporte', () => ({ EditarReporte: () => null }));
vi.mock('@/components/UbicacionDelReporte', () => ({ UbicacionDelReporte: () => null }));

afterEach(() => {
  vi.mocked(useMiReporte).mockReset();
});

const REPORTE: ReporteResumen = {
  id: 42,
  titulo: 'Bache en la avenida',
  estado: 'RECIBIDO',
  distritoNombre: 'Miraflores',
  categoriaNombre: 'Bache',
  fotoUrl: 'http://api/media/fotos/reportes/a.jpg',
};

function conDatos(reporte: ReporteResumen | null, entradas: HistorialEntrada[] = []) {
  vi.mocked(useMiReporte).mockReturnValue({
    estado: 'listo',
    datos: { reporte, entradas, errorDeRecarga: null },
    error: null,
    recargar: vi.fn(),
    recargando: false,
  } as unknown as ReturnType<typeof useMiReporte>);
}

const evento = (id: number, tipoEvento: string, comentario?: string): HistorialEntrada => ({
  id,
  tipoEvento,
  comentario,
  autor: 'Moderación de Ciudad Viva',
  fecha: '2026-10-29T15:10:00Z',
});

describe('DetalleMiReporte (NC-11b)', () => {
  it('sin moderación: foto, sin avisos y con el enlace a la vista pública', () => {
    conDatos(REPORTE, [evento(1, 'CAMBIO_ESTADO')]);
    render(<DetalleMiReporte reporteId={42} />);

    expect(screen.getByRole('img', { name: 'Foto del daño que reportaste' })).toBeInTheDocument();
    expect(screen.queryByText(/oculto por moderación/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vista pública/ })).toHaveAttribute('href', '/reportes/42');
  });

  it('reporte oculto: lo explica, sin la foto, con el motivo en el seguimiento y sin enlace público', () => {
    conDatos({ ...REPORTE, fotoUrl: undefined }, [
      evento(1, 'CAMBIO_ESTADO'),
      evento(2, 'REPORTE_OCULTO', 'Contenido ofensivo'),
    ]);
    render(<DetalleMiReporte reporteId={42} />);

    expect(screen.getByText('Reporte oculto')).toBeInTheDocument();
    expect(screen.getByText(/no aparece en el mapa ni en la vista pública/)).toBeInTheDocument();
    expect(screen.getByText('Este reporte no tiene foto.')).toBeInTheDocument();
    // El motivo del ADMIN llega por el historial, redactado por el servidor.
    expect(screen.getByText('Reporte oculto por moderación')).toBeInTheDocument();
    expect(screen.getByText('Contenido ofensivo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /vista pública/ })).not.toBeInTheDocument();
    // Nunca se habla de denuncias ni de quien denuncio.
    expect(screen.queryByText(/denunci/i)).not.toBeInTheDocument();
  });

  it('solo la foto oculta: el reporte sigue público y se dice por qué no hay foto', () => {
    conDatos({ ...REPORTE, fotoUrl: undefined }, [evento(1, 'FOTO_OCULTA', 'Se ve una placa')]);
    render(<DetalleMiReporte reporteId={42} />);

    expect(screen.getByText('Foto oculta')).toBeInTheDocument();
    expect(screen.getByText(/el reporte sigue público, pero sin su foto/)).toBeInTheDocument();
    expect(screen.queryByText('Reporte oculto')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vista pública/ })).toBeInTheDocument();
  });

  it('restablecido: vuelve a verse como antes', () => {
    conDatos(REPORTE, [evento(1, 'REPORTE_OCULTO', 'x'), evento(2, 'REPORTE_RESTABLECIDO', 'y')]);
    render(<DetalleMiReporte reporteId={42} />);

    expect(screen.queryByText('Reporte oculto')).not.toBeInTheDocument();
    expect(screen.getByText('Reporte restablecido')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vista pública/ })).toBeInTheDocument();
  });
});
