import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listarCategorias, listarDistritos } from '@/lib/api/catalogos';
import { rankingDistrital } from '../api';
import type { DesempenoDistrital } from '../model/formato';
import { IndiceDesempeno } from './IndiceDesempeno';

const { replace, parametros } = vi.hoisted(() => ({
  replace: vi.fn(),
  parametros: { valor: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/desempeno',
  useSearchParams: () => parametros.valor,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../api', () => ({ rankingDistrital: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ listarCategorias: vi.fn(), listarDistritos: vi.fn() }));

function fila(distritoId: number, distritoNombre: string, extra: Partial<DesempenoDistrital>) {
  return {
    distritoId,
    distritoNombre,
    categoriaId: null,
    totalReportes: 0,
    totalResueltos: 0,
    tasaResolucion: null,
    tiempoPromedioHoras: null,
    satisfaccionPromedio: null,
    totalCalificaciones: 0,
    ...extra,
  } satisfies DesempenoDistrital;
}

const MIRAFLORES = fila(21, 'Miraflores', {
  totalReportes: 18,
  totalResueltos: 12,
  tasaResolucion: 66.67,
  tiempoPromedioHoras: 57.5,
});
const SJL = fila(41, 'San Juan de Lurigancho', {
  totalReportes: 28,
  totalResueltos: 3,
  tasaResolucion: 10.71,
  tiempoPromedioHoras: 120,
});
const BARRANCO = fila(4, 'Barranco', {});
const ATE = fila(9, 'Ate', { totalReportes: 5, totalResueltos: 1, tasaResolucion: 20 });
const SURCO = fila(30, 'Santiago de Surco', { totalReportes: 7, totalResueltos: 7, tasaResolucion: 100 });
const TODOS = [MIRAFLORES, SJL, BARRANCO, ATE, SURCO];

function enUrl(query: string) {
  parametros.valor = new URLSearchParams(query);
}

beforeEach(() => {
  replace.mockReset();
  enUrl('');
  vi.mocked(rankingDistrital).mockReset().mockResolvedValue(TODOS);
  vi.mocked(listarCategorias).mockResolvedValue([{ id: 3, nombre: 'Bache', esEstandar: true }]);
  vi.mocked(listarDistritos).mockResolvedValue(TODOS.map((f) => ({ id: f.distritoId, nombre: f.distritoNombre })));
});

const comparacion = () => screen.findByRole('region', { name: /Comparación de distritos/ });

describe('IndiceDesempeno: comparar distritos (US-19)', () => {
  it('desde la URL compara lado a lado: tasa, resueltos/total y tiempo, más la gráfica', async () => {
    enUrl('comparar=21,41');
    render(<IndiceDesempeno />);

    const region = await comparacion();
    const tabla = within(region).getByRole('table');
    const columnas = within(tabla).getAllByRole('columnheader').map((c) => c.textContent);
    expect(columnas[0]).toMatch(/^Miraflores/);
    expect(columnas[1]).toMatch(/^San Juan de Lurigancho/);

    const tasa = within(tabla).getByRole('row', { name: /Tasa de resolución/ });
    expect(within(tasa).getAllByRole('cell').map((c) => c.textContent)).toEqual(['66.7 %', '10.7 %']);
    const totales = within(tabla).getByRole('row', { name: /Resueltos \/ total/ });
    expect(within(totales).getAllByRole('cell').map((c) => c.textContent)).toEqual(['12 / 18', '3 / 28']);
    const tiempo = within(tabla).getByRole('row', { name: /Tiempo promedio/ });
    expect(within(tiempo).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2 d 10 h', '5 d']);

    // La gráfica tiene su equivalente en texto para lectores de pantalla.
    expect(within(region).getByRole('img', { name: /Miraflores: 66\.7 %; San Juan de Lurigancho: 10\.7 %/ })).toBeInTheDocument();
  });

  it('marcar un distrito en la tabla lo agrega a la URL, en orden', async () => {
    enUrl('comparar=21');
    render(<IndiceDesempeno />);

    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Comparar San Juan de Lurigancho' }));

    expect(replace).toHaveBeenCalledWith('/desempeno?comparar=21,41', { scroll: false });
  });

  it('con un solo distrito pide elegir otro', async () => {
    enUrl('comparar=21');
    render(<IndiceDesempeno />);
    expect(within(await comparacion()).getByText(/Elige al menos un distrito más/)).toBeInTheDocument();
  });

  it('con 4 elegidos no agrega un quinto y explica el máximo', async () => {
    enUrl('comparar=21,41,4,9');
    render(<IndiceDesempeno />);

    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Comparar Santiago de Surco' }));

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Puedes comparar hasta 4 distritos');
    expect(screen.getByRole('checkbox', { name: 'Comparar Santiago de Surco' })).not.toBeChecked();
  });

  it('el tipo de daño se guarda en la URL junto a la comparación', async () => {
    enUrl('comparar=21,41');
    render(<IndiceDesempeno />);
    await screen.findByRole('option', { name: 'Bache' });

    await userEvent.setup().selectOptions(screen.getByLabelText('Tipo de daño'), '3');

    expect(replace).toHaveBeenCalledWith('/desempeno?comparar=21,41&categoria=3', { scroll: false });
  });

  it('filtrado por tipo de daño, un distrito sin reportes de ese tipo dice «Sin datos», no 0 %', async () => {
    enUrl('comparar=21,41&categoria=3');
    vi.mocked(rankingDistrital).mockResolvedValue([MIRAFLORES]);
    render(<IndiceDesempeno />);

    const region = await comparacion();
    expect(rankingDistrital).toHaveBeenCalledWith(3);
    expect(within(region).getByRole('heading', { name: /Bache/ })).toBeInTheDocument();
    const tasa = within(region).getByRole('row', { name: /Tasa de resolución/ });
    expect(within(tasa).getAllByRole('cell').map((c) => c.textContent)).toEqual(['66.7 %', 'Sin datos']);
    expect(within(region).getByRole('img').getAttribute('aria-label')).toContain('San Juan de Lurigancho: Sin datos');
  });

  it('sin fila no afirma «0 / 0»: el total también dice «Sin datos»', async () => {
    enUrl('comparar=21,41&categoria=3');
    vi.mocked(rankingDistrital).mockResolvedValue([MIRAFLORES]);
    render(<IndiceDesempeno />);

    const totales = within(await comparacion()).getByRole('row', { name: /Resueltos \/ total/ });
    expect(within(totales).getAllByRole('cell').map((c) => c.textContent)).toEqual(['12 / 18', 'Sin datos']);
  });

  it('si el índice falla no muestra una comparación con cifras inventadas', async () => {
    enUrl('comparar=21,41');
    vi.mocked(rankingDistrital).mockRejectedValue(new Error('500'));
    render(<IndiceDesempeno />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    expect(screen.queryByRole('region', { name: /Comparación de distritos/ })).not.toBeInTheDocument();
  });

  it('una URL editada con un distrito o un tipo inexistentes no los usa', async () => {
    enUrl('comparar=21,999,41&categoria=77');
    render(<IndiceDesempeno />);

    const region = await comparacion();
    await waitFor(() =>
      expect(within(region).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
        'MirafloresQuitar',
        'San Juan de LuriganchoQuitar',
      ]),
    );
    await waitFor(() => expect(rankingDistrital).toHaveBeenLastCalledWith(null));
    expect(within(region).getByRole('heading')).toHaveTextContent(/^Comparación de distritos$/);
  });

  it('quitar desde la comparación actualiza la URL', async () => {
    enUrl('comparar=21,41,4&categoria=3');
    render(<IndiceDesempeno />);

    await userEvent.setup().click(
      within(await comparacion()).getByRole('button', { name: 'Quitar San Juan de Lurigancho de la comparación' }),
    );

    expect(replace).toHaveBeenCalledWith('/desempeno?comparar=21,4&categoria=3', { scroll: false });
  });
});
