import { describe, expect, it } from 'vitest';
import { nombreDeArchivo, parametrosDeExportacion, type FiltrosExportacion } from './exportacion';

const SIN_FILTROS: FiltrosExportacion = {
  estado: null,
  categoriaId: null,
  fechaDesde: null,
  fechaHasta: null,
};

describe('parametrosDeExportacion', () => {
  it('sin filtros solo envía el formato', () => {
    expect(parametrosDeExportacion(SIN_FILTROS, 'CSV').toString()).toBe('formato=CSV');
  });

  it('traslada estado y categoría tal cual', () => {
    const params = parametrosDeExportacion(
      { ...SIN_FILTROS, estado: 'EN_PROCESO', categoriaId: 3 },
      'XLSX',
    );
    expect(params.get('formato')).toBe('XLSX');
    expect(params.get('estado')).toBe('EN_PROCESO');
    expect(params.get('categoriaId')).toBe('3');
  });

  it('las fechas cubren días locales completos, igual que el filtro de la bandeja', () => {
    const params = parametrosDeExportacion(
      { ...SIN_FILTROS, fechaDesde: '2026-10-01', fechaHasta: '2026-10-05' },
      'CSV',
    );
    // Se comparan en hora local: el resultado no depende de la zona de la máquina.
    const desde = new Date(params.get('fechaDesde') ?? '');
    const hasta = new Date(params.get('fechaHasta') ?? '');
    expect([desde.getFullYear(), desde.getMonth(), desde.getDate()]).toEqual([2026, 9, 1]);
    expect([desde.getHours(), desde.getMinutes(), desde.getSeconds()]).toEqual([0, 0, 0]);
    expect([hasta.getFullYear(), hasta.getMonth(), hasta.getDate()]).toEqual([2026, 9, 5]);
    expect([hasta.getHours(), hasta.getMinutes(), hasta.getMilliseconds()]).toEqual([23, 59, 999]);
    // Viajan como instantes ISO, que es lo que parsea `Instant` en el backend.
    expect(params.get('fechaDesde')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('una categoría 0 no se descarta como si fuera "sin filtro"', () => {
    expect(parametrosDeExportacion({ ...SIN_FILTROS, categoriaId: 0 }, 'CSV').get('categoriaId')).toBe('0');
  });
});

describe('nombreDeArchivo', () => {
  it('usa el nombre entre comillas que manda el backend', () => {
    expect(nombreDeArchivo('attachment; filename="reportes-miraflores.csv"', 'CSV')).toBe(
      'reportes-miraflores.csv',
    );
  });

  it('prefiere filename* (UTF-8) porque conserva las tildes', () => {
    expect(
      nombreDeArchivo(
        `attachment; filename="reportes-jes_s-mar_a.xlsx"; filename*=UTF-8''reportes-jes%C3%BAs-mar%C3%ADa.xlsx`,
        'XLSX',
      ),
    ).toBe('reportes-jesús-maría.xlsx');
  });

  it('acepta filename sin comillas', () => {
    expect(nombreDeArchivo('attachment; filename=reportes-lince.csv', 'CSV')).toBe('reportes-lince.csv');
  });

  it('sin cabecera usa un nombre genérico con la extensión del formato', () => {
    expect(nombreDeArchivo(null, 'CSV')).toBe('reportes.csv');
    expect(nombreDeArchivo(null, 'XLSX')).toBe('reportes.xlsx');
    expect(nombreDeArchivo('attachment', 'XLSX')).toBe('reportes.xlsx');
  });

  it('no deja que el nombre lleve rutas', () => {
    expect(nombreDeArchivo('attachment; filename="../../etc/x.csv"', 'CSV')).toBe('.._.._etc_x.csv');
  });
});
