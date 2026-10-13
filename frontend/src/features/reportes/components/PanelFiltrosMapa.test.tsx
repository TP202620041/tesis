import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PanelFiltrosMapa } from './PanelFiltrosMapa';
import { FILTROS_VACIOS } from '../model/bbox';
import { ESTADOS_EN_MAPA, estiloDeEstado } from '@/lib/types/estados';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';

const DISTRITOS: Distrito[] = [
  { id: 21, nombre: 'Miraflores', ubigeo: '150122' },
  { id: 17, nombre: 'Lince', ubigeo: '150116' },
];

const CATEGORIAS: CategoriaDano[] = [
  { id: 1, nombre: 'Bache', esEstandar: true },
  { id: 7, nombre: 'Malecón erosionado', esEstandar: false, distritoId: 21 },
];

function renderizar(props: Partial<Parameters<typeof PanelFiltrosMapa>[0]> = {}) {
  const onCambiar = vi.fn();
  render(
    <PanelFiltrosMapa
      filtros={FILTROS_VACIOS}
      onCambiar={onCambiar}
      distritos={DISTRITOS}
      categorias={CATEGORIAS}
      total={0}
      cargando={false}
      {...props}
    />,
  );
  return { onCambiar };
}

describe('PanelFiltrosMapa', () => {
  it('muestra el conteo de resultados', () => {
    renderizar({ total: 12 });
    expect(screen.getByText('12 reportes en esta zona')).toBeInTheDocument();
  });

  it('usa singular con un solo resultado', () => {
    renderizar({ total: 1 });
    expect(screen.getByText('1 reporte en esta zona')).toBeInTheDocument();
  });

  it('indica que está buscando mientras carga', () => {
    renderizar({ cargando: true, total: 5 });
    expect(screen.getByText('Buscando…')).toBeInTheDocument();
  });

  it('anuncia el conteo a lectores de pantalla', () => {
    // El número cambia sin que el usuario navegue: sin aria-live, quien usa
    // lector de pantalla no se entera de que el resultado cambió.
    renderizar({ total: 3 });
    expect(screen.getByText('3 reportes en esta zona')).toHaveAttribute('aria-live', 'polite');
  });

  it('lista los distritos y categorías recibidos', () => {
    renderizar();
    expect(screen.getByRole('option', { name: 'Miraflores' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Malecón erosionado' })).toBeInTheDocument();
  });

  it('emite el filtro de distrito seleccionado', async () => {
    const { onCambiar } = renderizar();
    await userEvent.selectOptions(screen.getByLabelText('Distrito'), '21');
    expect(onCambiar).toHaveBeenCalledWith({ ...FILTROS_VACIOS, distritoId: 21 });
  });

  it('emite null al volver a "Todos"', async () => {
    const { onCambiar } = renderizar({ filtros: { ...FILTROS_VACIOS, distritoId: 21 } });
    await userEvent.selectOptions(screen.getByLabelText('Distrito'), '');
    expect(onCambiar).toHaveBeenCalledWith({ ...FILTROS_VACIOS, distritoId: null });
  });

  it('conserva los otros filtros al cambiar uno', () => {
    // Un onCambiar que reemplazara el objeto entero borraría los demás
    // filtros en silencio.
    const { onCambiar } = renderizar({
      filtros: { distritoId: 21, categoriaId: 1, estado: null },
    });
    void userEvent.selectOptions(screen.getByLabelText('Estado'), 'RESUELTO');
    return vi.waitFor(() =>
      expect(onCambiar).toHaveBeenCalledWith({
        distritoId: 21,
        categoriaId: 1,
        estado: 'RESUELTO',
      }),
    );
  });

  it('ofrece limpiar solo cuando hay filtros aplicados', () => {
    renderizar();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('limpia todos los filtros de una vez', async () => {
    const { onCambiar } = renderizar({
      filtros: { distritoId: 21, categoriaId: 1, estado: 'RESUELTO' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onCambiar).toHaveBeenCalledWith(FILTROS_VACIOS);
  });

  it('muestra la leyenda con el nombre de cada estado, no solo el color', () => {
    // Accesibilidad (US-23): la información no puede depender solo del color.
    // Se busca DENTRO de la leyenda: las etiquetas también aparecen como
    // opciones del filtro de estado, y una búsqueda global las confundiría.
    renderizar();
    const leyenda = within(screen.getByRole('list', { name: 'Leyenda de estados' }));
    for (const estado of ESTADOS_EN_MAPA) {
      const { etiqueta, descripcion } = estiloDeEstado(estado);
      expect(leyenda.getByText(etiqueta)).toBeInTheDocument();
      expect(leyenda.getByText(descripcion)).toBeInTheDocument();
    }
  });

  it('no ofrece CANCELADO como filtro de estado', () => {
    // El backend ya no los devuelve por defecto: sería un filtro que
    // siempre da cero.
    renderizar();
    expect(screen.queryByRole('option', { name: 'Cancelado' })).not.toBeInTheDocument();
  });
});
