import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UbicacionDelReporte } from './UbicacionDelReporte';

// Leaflet no se prueba en jsdom: el mini mapa se reemplaza por un doble que
// solo deja ver con que datos se lo monto.
vi.mock('next/dynamic', () => ({
  default: () =>
    function MiniMapaDoble(props: { latitud: number; longitud: number; etiqueta: string }) {
      return <div data-testid="mini-mapa" data-etiqueta={props.etiqueta} data-punto={`${props.latitud},${props.longitud}`} />;
    },
}));

describe('UbicacionDelReporte (QA-1 I-1)', () => {
  it('muestra el mini mapa, las coordenadas y el enlace a OpenStreetMap', () => {
    render(<UbicacionDelReporte latitud={-12.118} longitud={-77.032} titulo="Bache en Av. Larco" />);

    expect(screen.getByRole('heading', { name: 'Ubicación' })).toBeInTheDocument();
    const mapa = screen.getByTestId('mini-mapa');
    expect(mapa).toHaveAttribute('data-punto', '-12.118,-77.032');
    expect(mapa).toHaveAttribute('data-etiqueta', 'Ubicación del daño: Bache en Av. Larco');
    expect(screen.getByText('-12.11800, -77.03200')).toBeInTheDocument();

    const enlace = screen.getByRole('link', { name: /Abrir en OpenStreetMap/ });
    expect(enlace).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/?mlat=-12.118000&mlon=-77.032000#map=18/-12.118000/-77.032000',
    );
    // Sale de la app: en otra pestaña, sin `opener` ni `Referer`, y avisado.
    expect(enlace).toHaveAttribute('target', '_blank');
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
    expect(enlace).toHaveAccessibleName('Abrir en OpenStreetMap (se abre en otra pestaña)');
  });

  it('sin coordenadas no inventa un punto', () => {
    render(<UbicacionDelReporte latitud={null} longitud={undefined} titulo="Bache" />);

    expect(screen.getByText('Sin ubicación registrada.')).toBeInTheDocument();
    expect(screen.queryByTestId('mini-mapa')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
