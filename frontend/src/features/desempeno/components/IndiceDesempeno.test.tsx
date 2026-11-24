import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listarCategorias, listarDistritos } from '@/lib/api/catalogos';
import { dashboardDeGestion, listarPeriodosDeGestion } from '../api';
import type { DashboardGestion, KpiGestion, PeriodoGestion } from '../model/gestion';
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
vi.mock('../api', () => ({ dashboardDeGestion: vi.fn(), listarPeriodosDeGestion: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ listarCategorias: vi.fn(), listarDistritos: vi.fn() }));

function kpi(distritoId: number, distritoNombre: string, extra: Partial<KpiGestion> = {}): KpiGestion {
  return {
    distritoId,
    distritoNombre,
    municipalidadNombre: `Municipalidad de ${distritoNombre}`,
    categoriaId: null,
    reportesValidos: 0,
    reportesResueltos: 0,
    tasaResolucion: null,
    tiempoPromedioDias: null,
    satisfaccionPromedio: null,
    totalCalificaciones: 0,
    ...extra,
  };
}

const MIRAFLORES = kpi(21, 'Miraflores', {
  reportesValidos: 18,
  reportesResueltos: 12,
  tasaResolucion: 66.67,
  tiempoPromedioDias: 2.4,
  satisfaccionPromedio: 4.25,
  totalCalificaciones: 8,
});
const SJL = kpi(41, 'San Juan de Lurigancho', {
  reportesValidos: 28,
  reportesResueltos: 3,
  tasaResolucion: 10.71,
  tiempoPromedioDias: 5,
});
const BARRANCO = kpi(4, 'Barranco');
// 3 de 3 resueltos: 100 %, pero con menos de 5 válidos.
const ATE = kpi(9, 'Ate', { reportesValidos: 3, reportesResueltos: 3, tasaResolucion: 100, tiempoPromedioDias: 0 });
const SURCO = kpi(30, 'Santiago de Surco', {
  reportesValidos: 7,
  reportesResueltos: 7,
  tasaResolucion: 100,
  tiempoPromedioDias: 1,
});
const TODOS = [MIRAFLORES, SJL, BARRANCO, ATE, SURCO];

const ACTUAL: PeriodoGestion = { id: 1, fechaInicio: '2023-01-01', fechaFin: '2026-12-31', vigente: true };
const SIGUIENTE: PeriodoGestion = { id: 2, fechaInicio: '2027-01-01', fechaFin: '2030-12-31', vigente: false };

function dashboard(periodo: PeriodoGestion, distritos: KpiGestion[], categoriaId: number | null = null): DashboardGestion {
  return { periodo, categoriaId, calculatedAt: '2026-11-23T20:15:02Z', distritos };
}

/** El 2027-2030 todavía no tiene reportes: 43 distritos con métricas en null y ceros en los conteos. */
function porPeriodo(periodoId: number, categoriaId?: number | null): Promise<DashboardGestion> {
  if (periodoId === 2) {
    return Promise.resolve(dashboard(SIGUIENTE, TODOS.map((f) => kpi(f.distritoId, f.distritoNombre))));
  }
  return Promise.resolve(dashboard(ACTUAL, TODOS, categoriaId ?? null));
}

function enUrl(query: string) {
  parametros.valor = new URLSearchParams(query);
}

beforeEach(() => {
  replace.mockReset();
  enUrl('');
  vi.mocked(listarPeriodosDeGestion).mockReset().mockResolvedValue([SIGUIENTE, ACTUAL]);
  vi.mocked(dashboardDeGestion).mockReset().mockImplementation(porPeriodo);
  vi.mocked(listarCategorias).mockResolvedValue([{ id: 3, nombre: 'Bache', esEstandar: true }]);
  vi.mocked(listarDistritos).mockResolvedValue(TODOS.map((f) => ({ id: f.distritoId, nombre: f.distritoNombre })));
});

const ranking = () => screen.findByRole('region', { name: 'Ranking de distritos' });
const comparacion = () => screen.findByRole('region', { name: /Comparación de distritos/ });
const filasDelRanking = async () => within(within(await ranking()).getByRole('table')).getAllByRole('row').slice(1);

describe('IndiceDesempeno: periodo de gestión (NC-06)', () => {
  it('por defecto consulta el periodo vigente, con el selector etiquetado', async () => {
    render(<IndiceDesempeno />);

    await ranking();
    const selector = screen.getByLabelText('Periodo de gestión');
    expect(selector).toHaveValue('1');
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '2027–2030',
      '2023–2026 (vigente)',
    ]);
    expect(dashboardDeGestion).toHaveBeenCalledWith(1, null);
    expect(dashboardDeGestion).not.toHaveBeenCalledWith(2, expect.anything());
  });

  it('muestra por municipalidad la tasa (2 decimales), los conteos, el tiempo en días y la satisfacción', async () => {
    render(<IndiceDesempeno />);

    const miraflores = within(await ranking()).getByRole('row', { name: /Miraflores/ });
    expect(within(miraflores).getByRole('rowheader')).toHaveTextContent('MirafloresMunicipalidad de Miraflores');
    expect(miraflores).toHaveTextContent('66.67 %');
    expect(miraflores).toHaveTextContent('12 / 18');
    expect(miraflores).toHaveTextContent('2.4 días');
    expect(miraflores).toHaveTextContent('4.25 / 5(8)');
  });

  it('el ranking no lo encabeza un 100 % con datos insuficientes: va al final, sin puesto', async () => {
    render(<IndiceDesempeno />);

    const filas = await filasDelRanking();
    expect(filas.map((f) => within(f).getByRole('rowheader').textContent)).toEqual([
      'Santiago de SurcoMunicipalidad de Santiago de Surco',
      'MirafloresMunicipalidad de Miraflores',
      'San Juan de LuriganchoMunicipalidad de San Juan de Lurigancho',
      'AteMunicipalidad de Ate',
      'BarrancoMunicipalidad de Barranco',
    ]);
    const ate = filas[3]!;
    expect(within(ate).getAllByRole('cell')[0]).toHaveTextContent('Sin puesto');
    expect(ate).toHaveTextContent('Datos insuficientes');
    // 3 resueltos alcanzan para el tiempo; 0,0 días no se muestra como «0 días».
    expect(ate).toHaveTextContent('< 0.1 días');
    expect(within(filas[0]!).getAllByRole('cell')[0]).toHaveTextContent('1');
  });

  it('«Sin datos» (null) no es 0', async () => {
    render(<IndiceDesempeno />);

    const barranco = within(await ranking()).getByRole('row', { name: /Barranco/ });
    expect(barranco).toHaveTextContent('Sin datos');
    expect(barranco).not.toHaveTextContent('0 %');
    expect(barranco).not.toHaveTextContent(/0 días/);
  });

  it('cambiar de periodo lo guarda en la URL', async () => {
    render(<IndiceDesempeno />);
    await ranking();

    await userEvent.setup().selectOptions(screen.getByLabelText('Periodo de gestión'), '2');

    expect(replace).toHaveBeenCalledWith('/desempeno?periodo=2', { scroll: false });
  });

  it('un periodo sin reportes (2027-2030) dice «Sin datos», no una tabla de ceros', async () => {
    enUrl('periodo=2');
    render(<IndiceDesempeno />);

    expect(await screen.findByText(/El periodo 2027–2030 todavía no tiene reportes válidos/)).toBeInTheDocument();
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
    expect(dashboardDeGestion).toHaveBeenCalledWith(2, null);
    expect(screen.queryByRole('region', { name: 'Ranking de distritos' })).not.toBeInTheDocument();
    expect(screen.queryByText('0 %')).not.toBeInTheDocument();
  });

  it('explica en la misma página cómo se calcula cada indicador', async () => {
    render(<IndiceDesempeno />);

    const explicacion = await screen.findByRole('region', { name: 'Cómo se calcula cada indicador' });
    expect(explicacion).toHaveTextContent('Reportes resueltos ÷ reportes válidos × 100');
    expect(explicacion).toHaveTextContent(/en días, con un decimal/i);
    expect(explicacion).toHaveTextContent(/menos de 5 reportes válidos/);
    expect(explicacion).toHaveTextContent(/menos de 3 resueltos/);
    expect(explicacion).toHaveTextContent(/Los rechazados sí cuentan/);
  });

  it('si los periodos no cargan, avisa sin inventar cifras', async () => {
    vi.mocked(listarPeriodosDeGestion).mockRejectedValue(new Error('500'));
    render(<IndiceDesempeno />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    expect(dashboardDeGestion).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Ranking de distritos' })).not.toBeInTheDocument();
  });
});

describe('IndiceDesempeno: comparar distritos (US-19)', () => {
  it('desde la URL compara lado a lado: tasa, resueltos/válidos, tiempo y satisfacción, más la gráfica', async () => {
    enUrl('comparar=21,41');
    render(<IndiceDesempeno />);

    const region = await comparacion();
    expect(within(region).getByRole('heading', { name: 'Comparación de distritos · 2023–2026' })).toBeInTheDocument();
    const tabla = within(region).getByRole('table');
    const columnas = within(tabla).getAllByRole('columnheader').map((c) => c.textContent);
    expect(columnas[0]).toMatch(/^Miraflores/);
    expect(columnas[1]).toMatch(/^San Juan de Lurigancho/);

    const celdas = (nombre: RegExp) =>
      within(within(tabla).getByRole('row', { name: nombre })).getAllByRole('cell').map((c) => c.textContent);
    expect(celdas(/Tasa de resolución/)).toEqual(['66.67 %', '10.71 %']);
    expect(celdas(/Resueltos \/ válidos/)).toEqual(['12 / 18', '3 / 28']);
    expect(celdas(/Tiempo promedio/)).toEqual(['2.4 días', '5 días']);
    expect(celdas(/Satisfacción/)).toEqual(['4.25 / 5', 'Sin datos']);

    // La gráfica tiene su equivalente en texto para lectores de pantalla.
    expect(
      within(region).getByRole('img', { name: /Miraflores: 66\.67 %; San Juan de Lurigancho: 10\.71 %/ }),
    ).toBeInTheDocument();
  });

  it('en la comparación, la tasa con datos insuficientes no se dibuja ni se afirma', async () => {
    enUrl('comparar=21,9');
    render(<IndiceDesempeno />);

    const region = await comparacion();
    expect(within(region).getByRole('img').getAttribute('aria-label')).toContain('Ate: Datos insuficientes');
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

  it('el periodo y el tipo de daño se guardan en la URL junto a la comparación', async () => {
    enUrl('comparar=21,41&periodo=1');
    render(<IndiceDesempeno />);
    await screen.findByRole('option', { name: 'Bache' });

    await userEvent.setup().selectOptions(screen.getByLabelText('Tipo de daño'), '3');

    expect(replace).toHaveBeenCalledWith('/desempeno?comparar=21,41&periodo=1&categoria=3', { scroll: false });
  });

  it('filtrado por tipo de daño, un distrito sin reportes de ese tipo dice «Sin datos», no 0 % ni 0 / 0', async () => {
    enUrl('comparar=21,41&categoria=3');
    vi.mocked(dashboardDeGestion).mockResolvedValue(dashboard(ACTUAL, [MIRAFLORES], 3));
    render(<IndiceDesempeno />);

    const region = await comparacion();
    expect(dashboardDeGestion).toHaveBeenCalledWith(1, 3);
    expect(within(region).getByRole('heading', { name: /Bache/ })).toBeInTheDocument();
    const celdas = (nombre: RegExp) =>
      within(within(region).getByRole('row', { name: nombre })).getAllByRole('cell').map((c) => c.textContent);
    expect(celdas(/Tasa de resolución/)).toEqual(['66.67 %', 'Sin datos']);
    expect(celdas(/Resueltos \/ válidos/)).toEqual(['12 / 18', 'Sin datos']);
    expect(within(region).getByRole('img').getAttribute('aria-label')).toContain('San Juan de Lurigancho: Sin datos');
  });

  it('si el dashboard falla no muestra una comparación con cifras inventadas', async () => {
    enUrl('comparar=21,41');
    vi.mocked(dashboardDeGestion).mockRejectedValue(new Error('500'));
    render(<IndiceDesempeno />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    expect(screen.queryByRole('region', { name: /Comparación de distritos/ })).not.toBeInTheDocument();
  });

  it('una URL editada con un distrito, un tipo o un periodo inexistentes no los usa', async () => {
    enUrl('comparar=21,999,41&categoria=77&periodo=99');
    render(<IndiceDesempeno />);

    const region = await comparacion();
    await waitFor(() =>
      expect(within(region).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
        'MirafloresQuitar',
        'San Juan de LuriganchoQuitar',
      ]),
    );
    await waitFor(() => expect(dashboardDeGestion).toHaveBeenLastCalledWith(1, null));
    expect(within(region).getByRole('heading')).toHaveTextContent(/^Comparación de distritos · 2023–2026$/);
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

describe('IndiceDesempeno: ranking en el móvil (QA-1 M-12)', () => {
  it('la tabla va en una región con foco y un aviso visible solo en el móvil dice que se desliza', async () => {
    render(<IndiceDesempeno />);

    const region = await ranking();
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('table')).toBeInTheDocument();
    // Texto oculto desde `md`, y no es la descripción de la región: si no,
    // el lector lo anunciaría también en escritorio, donde la tabla cabe.
    expect(screen.getByText(/Desliza la tabla hacia los lados/)).toHaveClass('md:hidden');
    expect(region).not.toHaveAttribute('aria-describedby');
    expect(region).not.toHaveAccessibleDescription();
  });

  it('los encabezados ordenan la tabla y comunican el orden', async () => {
    render(<IndiceDesempeno />);
    const tabla = within(await ranking()).getByRole('table');
    expect(within(tabla).getByRole('columnheader', { name: /Tasa de resolución/ })).toHaveAttribute('aria-sort', 'descending');

    await userEvent.setup().click(within(tabla).getByRole('button', { name: /Tiempo promedio/ }));

    expect(within(tabla).getByRole('columnheader', { name: /Tiempo promedio/ })).toHaveAttribute('aria-sort', 'ascending');
    // Por tiempo, Ate (0,0 días con 3 resueltos) es el más rápido.
    const primera = within(tabla).getAllByRole('row')[1]!;
    expect(within(primera).getByRole('rowheader')).toHaveTextContent(/^Ate/);
  });
});
