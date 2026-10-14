import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { estiloDeEstado } from '@/lib/types/estados';
import type { ReporteResumen } from '../model/tipos';
import { ListaReportes } from './ListaReportes';

function reporte(id: number, extra: Partial<ReporteResumen> = {}): ReporteResumen {
  return {
    id,
    categoriaNombre: `Categoría ${id}`,
    estado: 'PENDIENTE',
    distritoNombre: 'Miraflores',
    totalAdhesiones: 1,
    createdAt: '2026-10-05T15:00:00Z',
    ...extra,
  };
}

const varios = (n: number) => Array.from({ length: n }, (_, i) => reporte(i + 1));

describe('ListaReportes', () => {
  it('muestra categoría, estado con nombre, distrito y adhesiones, con enlace al detalle', () => {
    render(
      <ListaReportes consultaHecha cargando={false}
        reportes={[reporte(7, { estado: 'EN_PROCESO', categoriaNombre: 'Bache', totalAdhesiones: 3 })]}
      />,
    );
    const enlace = screen.getByRole('link');
    expect(enlace).toHaveAttribute('href', '/reportes/7');
    expect(within(enlace).getByText('Bache')).toBeInTheDocument();
    // US-23: el estado se nombra, no solo se colorea.
    expect(within(enlace).getByText(estiloDeEstado('EN_PROCESO').etiqueta)).toBeInTheDocument();
    expect(enlace).toHaveTextContent('Miraflores');
    expect(enlace).toHaveTextContent('3 vecinos lo reportaron');
  });

  it('muestra la fecha del reporte', () => {
    render(<ListaReportes consultaHecha cargando={false} reportes={[reporte(1)]} />);
    const fecha = new Date('2026-10-05T15:00:00Z').toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    expect(screen.getByRole('link')).toHaveTextContent(fecha);
  });

  it('usa singular con una sola adhesión', () => {
    render(<ListaReportes consultaHecha cargando={false} reportes={[reporte(1)]} />);
    expect(screen.getByRole('link')).toHaveTextContent('1 vecino lo reportó');
  });

  it('pagina los resultados y navega entre páginas', async () => {
    render(<ListaReportes consultaHecha cargando={false} reportes={varios(25)} tamanoPagina={10} />);
    expect(screen.getAllByRole('link')).toHaveLength(10);
    expect(screen.getByText('1–10 de 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByText('21–25 de 25')).toBeInTheDocument();
    expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('11–20 de 25')).toBeInTheDocument();
  });

  it('no muestra señales internas del resumen', () => {
    render(<ListaReportes consultaHecha cargando={false} reportes={[reporte(1, { posibleReincidencia: true })]} />);
    expect(screen.getByRole('link')).not.toHaveTextContent(/reincid/i);
  });

  it('avisa cuando no hay resultados', () => {
    render(<ListaReportes consultaHecha cargando={false} reportes={[]} />);
    expect(screen.getByText(/No hay reportes en esta zona/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('antes de la primera respuesta no afirma que no haya reportes', () => {
    render(<ListaReportes reportes={[]} consultaHecha={false} cargando={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Buscando reportes…');
    expect(screen.queryByText(/No hay reportes/)).not.toBeInTheDocument();
  });

  it('mientras carga una consulta nueva tampoco afirma cero resultados', () => {
    render(<ListaReportes reportes={[]} consultaHecha cargando />);
    expect(screen.getByRole('status')).toHaveTextContent('Buscando reportes…');
    expect(screen.queryByText(/No hay reportes/)).not.toBeInTheDocument();
  });

  it('con resultados anteriores en pantalla avisa que se están actualizando', () => {
    render(<ListaReportes reportes={[reporte(1)]} consultaHecha cargando />);
    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Actualizando…');
    expect(screen.getByRole('region', { name: 'Reportes en esta zona' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
