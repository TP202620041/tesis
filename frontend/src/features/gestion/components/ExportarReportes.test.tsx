import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { ExportarReportes } from './ExportarReportes';
import { exportarReportes } from '../api';
import type { FiltrosExportacion } from '../model/exportacion';

vi.mock('../api', () => ({ exportarReportes: vi.fn() }));

const exportar = vi.mocked(exportarReportes);

const FILTROS: FiltrosExportacion = {
  estado: 'RECIBIDO',
  categoriaId: 2,
  fechaDesde: '2026-10-01',
  fechaHasta: null,
};

// jsdom no implementa URL.createObjectURL ni la descarga real.
const crearUrl = vi.fn(() => 'blob:prueba');
const revocarUrl = vi.fn();
let descargas: { href: string; download: string }[] = [];

beforeEach(() => {
  exportar.mockReset();
  crearUrl.mockClear();
  revocarUrl.mockClear();
  descargas = [];
  Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: revocarUrl });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    descargas.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  // Se quitan para no dejar el global de jsdom modificado en otros archivos.
  const urlMutable = URL as unknown as Record<string, unknown>;
  delete urlMutable.createObjectURL;
  delete urlMutable.revokeObjectURL;
});

describe('ExportarReportes', () => {
  it('exporta con los filtros activos y descarga con el nombre del backend', async () => {
    const contenido = new Blob(['a;b']);
    exportar.mockResolvedValue({ contenido, nombreArchivo: 'reportes-miraflores.xlsx' });
    render(<ExportarReportes filtros={FILTROS} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Exportar Excel' }));

    expect(exportar).toHaveBeenCalledWith(FILTROS, 'XLSX');
    await waitFor(() => expect(descargas).toEqual([{ href: 'blob:prueba', download: 'reportes-miraflores.xlsx' }]));
    expect(crearUrl).toHaveBeenCalledWith(contenido);
    await waitFor(() => expect(revocarUrl).toHaveBeenCalledWith('blob:prueba'));
    // El enlace temporal no queda en el documento.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('si no hay reportes para esos filtros muestra el mensaje y no descarga nada', async () => {
    exportar.mockRejectedValue(
      new ApiError(400, 'No hay reportes que coincidan con los filtros seleccionados para exportar'),
    );
    render(<ExportarReportes filtros={FILTROS} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Exportar CSV' }));

    expect(
      await screen.findByText('No hay reportes que coincidan con los filtros seleccionados para exportar'),
    ).toBeInTheDocument();
    expect(descargas).toEqual([]);
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
  });
});
