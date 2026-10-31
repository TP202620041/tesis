import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import {
  descargarFotoModerada,
  desestimarDenuncias,
  detalleDeModeracion,
  historialDeModeracion,
  ocultarContenido,
  restablecerContenido,
} from '../api';
import { AVISO_MOTIVO } from '../model/moderacion';
import type { Denuncia, ReporteEnModeracion } from '../model/tipos';
import { DetalleModeracion } from './DetalleModeracion';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/UbicacionDelReporte', () => ({ UbicacionDelReporte: () => null }));
vi.mock('../api', () => ({
  detalleDeModeracion: vi.fn(),
  historialDeModeracion: vi.fn(),
  descargarFotoModerada: vi.fn(),
  ocultarContenido: vi.fn(),
  restablecerContenido: vi.fn(),
  desestimarDenuncias: vi.fn(),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

const revocar = vi.fn();

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, revokeObjectURL: revocar });
  vi.mocked(historialDeModeracion).mockResolvedValue([
    { id: 1, tipoEvento: 'FOTO_OCULTA', comentario: 'Placa visible', autor: 'Admin Uno', fecha: '2026-10-29T15:10:00Z' },
  ]);
  vi.mocked(descargarFotoModerada).mockResolvedValue('blob:foto-42');
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const fn of [detalleDeModeracion, historialDeModeracion, descargarFotoModerada, ocultarContenido, restablecerContenido, desestimarDenuncias]) {
    vi.mocked(fn).mockReset();
  }
  revocar.mockReset();
});

const DENUNCIA: Denuncia = {
  id: 7,
  motivo: 'DATOS_PERSONALES',
  estado: 'PENDIENTE',
  detalle: 'Se ve la placa',
  createdAt: '2026-10-29T14:50:00Z',
  denunciante: { id: 31, nombre: 'Ana Vecina', email: 'ana@ejemplo.pe' },
  resueltaEn: null,
  motivoResolucion: null,
};

const REPORTE: ReporteEnModeracion = {
  id: 42,
  latitud: -12.1,
  longitud: -77.0,
  titulo: 'Bache en la avenida',
  descripcion: 'Hondo',
  severidad: 'MEDIA',
  categoriaNombre: 'Bache',
  estado: 'RECIBIDO',
  distritoNombre: 'Miraflores',
  createdAt: '2026-10-29T15:02:11Z',
  tieneFoto: true,
  oculto: false,
  fotoOculta: false,
  denuncias: [DENUNCIA],
};

async function montar(reporte: ReporteEnModeracion = REPORTE) {
  vi.mocked(detalleDeModeracion).mockResolvedValue(reporte);
  render(<DetalleModeracion reporteId={reporte.id} />);
  await screen.findByRole('heading', { name: 'Bache en la avenida' });
}

const MOTIVO = 'La foto muestra la placa de un vehículo particular';

describe('DetalleModeracion (NC-11b)', () => {
  it('muestra la foto traída con el token como blob:, las denuncias con quien denunció y el historial', async () => {
    await montar();

    const foto = await screen.findByRole('img', { name: 'Foto del reporte: Bache en la avenida' });
    expect(foto).toHaveAttribute('src', 'blob:foto-42');
    expect(descargarFotoModerada).toHaveBeenCalledWith(42);
    expect(screen.getByText('Visible para todos: nada está oculto.')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Denuncias (1)' })).toBeInTheDocument();
    expect(screen.getByText('Muestra datos personales')).toBeInTheDocument();
    expect(screen.getByText('Ana Vecina · ana@ejemplo.pe')).toBeInTheDocument();
    expect(screen.getByText('Se ve la placa')).toBeInTheDocument();

    expect(screen.getByText('Foto oculta por moderación')).toBeInTheDocument();
    expect(screen.getByText(/Admin Uno/)).toBeInTheDocument();
  });

  it('ofrece solo las acciones que corresponden al estado', async () => {
    await montar();
    expect(screen.getByRole('button', { name: 'Ocultar el reporte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar la foto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restablecer el reporte' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desestimar denuncias' })).toBeInTheDocument();
  });

  it('oculto y sin foto: restablecer el reporte, nada de la foto, y lo dice', async () => {
    await montar({ ...REPORTE, oculto: true, tieneFoto: false, denuncias: [{ ...DENUNCIA, estado: 'ATENDIDA' }] });
    expect(screen.getByText('Reporte oculto')).toBeInTheDocument();
    expect(screen.getByText(/no cuenta en el índice de desempeño/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restablecer el reporte' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /la foto/ })).not.toBeInTheDocument();
    expect(screen.getByText('El reporte no tiene foto.')).toBeInTheDocument();
    // Sin pendientes no hay que desestimar.
    expect(screen.queryByRole('button', { name: 'Desestimar denuncias' })).not.toBeInTheDocument();
    expect(descargarFotoModerada).not.toHaveBeenCalled();
  });

  it('con la foto oculta la sigue mostrando al ADMIN y lo avisa', async () => {
    await montar({ ...REPORTE, fotoOculta: true });
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:foto-42');
    expect(screen.getByText(/Esta foto está oculta: el público no la ve/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restablecer la foto' })).toBeInTheDocument();
  });

  it('ocultar la foto: el diálogo con el aviso del motivo, el POST y la recarga', async () => {
    await montar();
    vi.mocked(ocultarContenido).mockResolvedValue({ ...REPORTE, fotoOculta: true });
    vi.mocked(detalleDeModeracion).mockResolvedValue({ ...REPORTE, fotoOculta: true });

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar la foto' }));
    const dialogo = screen.getByRole('dialog', { name: 'Ocultar la foto' });
    expect(within(dialogo).getByText(AVISO_MOTIVO)).toBeInTheDocument();
    expect(within(dialogo).getByText(/el índice de desempeño no cambia/)).toBeInTheDocument();

    await userEvent.type(within(dialogo).getByLabelText('Motivo'), MOTIVO);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ocultar la foto' }));

    await waitFor(() => expect(ocultarContenido).toHaveBeenCalledWith(42, { alcance: 'FOTO', motivo: MOTIVO }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Foto oculta')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Restablecer la foto' })).toBeInTheDocument();
  });

  it('restablecer el reporte: el diálogo avisa que vuelve al índice y llama al POST', async () => {
    await montar({ ...REPORTE, oculto: true });
    vi.mocked(restablecerContenido).mockResolvedValue(REPORTE);
    vi.mocked(detalleDeModeracion).mockResolvedValue(REPORTE);

    await userEvent.click(screen.getByRole('button', { name: 'Restablecer el reporte' }));
    const dialogo = screen.getByRole('dialog', { name: 'Restablecer el reporte' });
    expect(within(dialogo).getByText(/vuelve a contar en el índice/)).toBeInTheDocument();
    expect(within(dialogo).getByText(AVISO_MOTIVO)).toBeInTheDocument();

    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Revisado: no infringe las reglas');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Restablecer el reporte' }));

    await waitFor(() =>
      expect(restablecerContenido).toHaveBeenCalledWith(42, { alcance: 'REPORTE', motivo: 'Revisado: no infringe las reglas' }),
    );
    await waitFor(() => expect(screen.getByText('Visible para todos: nada está oculto.')).toBeInTheDocument());
  });

  it('el 400 MOTIVO_IDENTIFICA_DENUNCIANTE queda en el campo del motivo', async () => {
    await montar();
    vi.mocked(ocultarContenido).mockRejectedValue(
      new ApiError(400, 'El motivo no puede incluir el correo de quien denunció: lo leerán el autor y la municipalidad', '', ['motivo'], 'MOTIVO_IDENTIFICA_DENUNCIANTE'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar el reporte' }));
    const dialogo = screen.getByRole('dialog', { name: 'Ocultar el reporte' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Lo denunció ana@ejemplo.pe, tiene razón');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ocultar el reporte' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('no puede incluir el correo de quien denunció');
    expect(within(dialogo).getByLabelText('Motivo')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('un 409 YA_OCULTO cierra el diálogo, avisa que cambió y recarga', async () => {
    await montar();
    vi.mocked(ocultarContenido).mockRejectedValue(new ApiError(409, 'La foto ya está oculta', '', [], 'YA_OCULTO'));
    vi.mocked(detalleDeModeracion).mockResolvedValue({ ...REPORTE, fotoOculta: true });

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar la foto' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), MOTIVO);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ocultar la foto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La foto ya está oculta');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Foto oculta')).toBeInTheDocument());
  });

  it('desestimar las denuncias pendientes (con motivo opcional) y recargar', async () => {
    await montar();
    const desestimado = { ...REPORTE, denuncias: [{ ...DENUNCIA, estado: 'DESESTIMADA' as const, resueltaEn: '2026-10-29T16:00:00Z', motivoResolucion: 'No es indebido' }] };
    vi.mocked(desestimarDenuncias).mockResolvedValue(desestimado);
    vi.mocked(detalleDeModeracion).mockResolvedValue(desestimado);

    await userEvent.type(screen.getByLabelText(/^Motivo/), 'No es indebido');
    await userEvent.click(screen.getByRole('button', { name: 'Desestimar denuncias' }));

    await waitFor(() => expect(desestimarDenuncias).toHaveBeenCalledWith(42, 'No es indebido'));
    await waitFor(() => expect(screen.getByText('Desestimada')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Desestimar denuncias' })).not.toBeInTheDocument();
  });

  it('con un id inválido o un 404 dice «Reporte no disponible» y vuelve a la bandeja', async () => {
    render(<DetalleModeracion reporteId={null} />);
    expect(screen.getByRole('heading', { name: 'Reporte no disponible' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a la bandeja de moderación' })).toHaveAttribute('href', '/admin/moderacion');
    expect(detalleDeModeracion).not.toHaveBeenCalled();
  });

  it('un 404 del backend también', async () => {
    vi.mocked(detalleDeModeracion).mockRejectedValue(new ApiError(404, 'No se encontró el reporte'));
    render(<DetalleModeracion reporteId={99} />);
    expect(await screen.findByRole('heading', { name: 'Reporte no disponible' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No se encontró el reporte');
  });
});
