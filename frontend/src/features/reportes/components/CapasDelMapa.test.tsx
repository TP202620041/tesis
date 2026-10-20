import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CapasDelMapa, MENSAJE_SIN_REPORTES_EN_ZONA, type EstadoCapaCalor } from './CapasDelMapa';
import { capaDeCalor } from '../model/densidad';

const CON_DATOS: EstadoCapaCalor = {
  ...capaDeCalor(
    {
      celdaGrados: 0.001,
      totalReportes: 11,
      celdas: [
        { latitud: -12.12, longitud: -77.03, cantidad: 10 },
        { latitud: -12.115, longitud: -77.025, cantidad: 1 },
      ],
    },
    null,
  ),
  celdaGrados: 0.001,
  consultaHecha: true,
  cargando: false,
  error: null,
  sinReportesEnVista: false,
};

const SIN_DATOS: EstadoCapaCalor = {
  leyenda: [],
  maximo: 0,
  totalEnVista: 0,
  celdaGrados: 0.001,
  consultaHecha: true,
  cargando: false,
  error: null,
  sinReportesEnVista: true,
};

function renderizar(props: Partial<Parameters<typeof CapasDelMapa>[0]> = {}) {
  const onCambiarMarcadores = vi.fn();
  const onCambiarCalor = vi.fn();
  render(
    <CapasDelMapa
      marcadores
      onCambiarMarcadores={onCambiarMarcadores}
      calor={false}
      onCambiarCalor={onCambiarCalor}
      capaCalor={CON_DATOS}
      {...props}
    />,
  );
  return { onCambiarMarcadores, onCambiarCalor };
}

describe('CapasDelMapa', () => {
  it('activa y desactiva cada capa por separado', async () => {
    const { onCambiarMarcadores, onCambiarCalor } = renderizar();

    await userEvent.click(screen.getByLabelText('Mapa de calor'));
    expect(onCambiarCalor).toHaveBeenCalledWith(true);

    await userEvent.click(screen.getByLabelText('Marcadores de reportes'));
    expect(onCambiarMarcadores).toHaveBeenCalledWith(false);
  });

  it('con la capa apagada no muestra su leyenda', () => {
    renderizar();
    expect(screen.queryByText('Densidad de reportes')).not.toBeInTheDocument();
  });

  it('la leyenda nombra cada nivel con su cantidad, no solo con color', () => {
    renderizar({ calor: true });
    const leyenda = screen.getByRole('list', { name: 'Leyenda del mapa de calor' });
    const items = within(leyenda).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Baja: 1 a 2 reportes',
      'Media: 3 a 5 reportes',
      'Alta: 6 a 7 reportes',
      'Muy alta: 8 a 10 reportes',
    ]);
    expect(screen.getByText('11 reportes en la vista')).toBeInTheDocument();
    expect(screen.getByText(/Escala relativa a la zona con más reportes en la vista \(10\)/)).toBeInTheDocument();
    expect(screen.getByText(/con un mínimo de 4: un reporte aislado no se muestra como densidad alta/)).toBeInTheDocument();
    expect(screen.getByText(/unos 110 m de lado/)).toBeInTheDocument();
  });

  it('el total de la vista no se anuncia: solo los cambios de estado van en la región viva', () => {
    renderizar({ calor: true });
    const total = screen.getByText('11 reportes en la vista');
    expect(total.closest('[aria-live]')).toBeNull();
  });

  it('mientras actualiza avisa «Actualizando…» y conserva la leyenda', () => {
    renderizar({ calor: true, capaCalor: { ...CON_DATOS, cargando: true } });
    expect(screen.getByText('Actualizando…')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('list', { name: 'Leyenda del mapa de calor' })).toBeInTheDocument();
    expect(screen.getByText('11 reportes en la vista')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay reportes en la vista', () => {
    renderizar({ calor: true, capaCalor: SIN_DATOS });
    expect(screen.getByText(MENSAJE_SIN_REPORTES_EN_ZONA)).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('list', { name: 'Leyenda del mapa de calor' })).not.toBeInTheDocument();
  });

  it('avisa mientras llega la primera densidad', () => {
    renderizar({ calor: true, capaCalor: { ...SIN_DATOS, consultaHecha: false, sinReportesEnVista: false } });
    expect(screen.getByText('Calculando densidad…')).toBeInTheDocument();
  });

  it('muestra el error como alerta', () => {
    renderizar({ calor: true, capaCalor: { ...SIN_DATOS, error: 'Sin conexión', sinReportesEnVista: false } });
    expect(screen.getByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.queryByText(MENSAJE_SIN_REPORTES_EN_ZONA)).not.toBeInTheDocument();
  });
});
