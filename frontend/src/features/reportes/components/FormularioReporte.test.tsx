import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { distritoPorCoordenadas, listarCategorias } from '@/lib/api/catalogos';
import { ApiError, NetworkError } from '@/lib/api/errors';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
import { crearReporte } from '../api';
import { useEncolarReporte } from '../hooks/useColaOffline';
import type { ReporteCreado } from '../model/tipos';
import { FormularioReporte } from './FormularioReporte';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../api', () => ({ crearReporte: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ distritoPorCoordenadas: vi.fn(), listarCategorias: vi.fn() }));
vi.mock('../hooks/useColaOffline', () => ({ useEncolarReporte: vi.fn() }));

const encolar = vi.fn();

beforeEach(() => {
  vi.mocked(useEncolarReporte).mockReturnValue(encolar);
  vi.mocked(listarCategorias).mockResolvedValue([{ id: 3, nombre: 'Bache', esEstandar: true } as CategoriaDano]);
  vi.mocked(distritoPorCoordenadas).mockResolvedValue({ id: 1, nombre: 'Miraflores' } as Distrito);
  vi.mocked(crearReporte).mockRejectedValue(new NetworkError());
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: -12.12, longitude: -77.03, accuracy: 5 } } as GeolocationPosition),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  encolar.mockReset();
  vi.mocked(crearReporte).mockReset();
});

async function llenarYEnviar(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }));
  await screen.findByText('Municipalidad de Miraflores');
  await usuario.selectOptions(screen.getByLabelText('Tipo de daño'), '3');
  await usuario.type(screen.getByLabelText('Título'), 'Bache profundo');
  await usuario.click(screen.getByRole('radio', { name: 'Alta' }));
  await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));
}

const claveDe = (llamada: number) =>
  (vi.mocked(crearReporte).mock.calls[llamada]?.[0] as { idempotencyKey: string }).idempotencyKey;

describe('FormularioReporte: título y severidad (NC-02)', () => {
  it('la severidad empieza sin elegir y sin ella no se envía', async () => {
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);

    for (const nombre of ['Baja', 'Media', 'Alta']) {
      expect(screen.getByRole('radio', { name: nombre })).not.toBeChecked();
    }

    await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }));
    await screen.findByText('Municipalidad de Miraflores');
    await usuario.selectOptions(screen.getByLabelText('Tipo de daño'), '3');
    await usuario.type(screen.getByLabelText('Título'), 'Bache profundo');
    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    const mensaje = await screen.findByText('Elige la severidad del daño.');
    // El error queda en el grupo de severidad, enlazado por aria-describedby.
    const grupo = screen.getByRole('radiogroup', { name: 'Severidad' });
    expect(grupo).toHaveAttribute('aria-invalid', 'true');
    expect(grupo.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(screen.getByLabelText('Título')).not.toHaveAttribute('aria-invalid');
    expect(crearReporte).not.toHaveBeenCalled();
  });

  it('un error de campo borra el error anterior del envío (no conviven)', async () => {
    vi.mocked(crearReporte).mockRejectedValueOnce(
      new ApiError(409, 'Ya reportaste este daño'),
    );
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);

    await llenarYEnviar(usuario);
    expect(await screen.findByText('Ya reportaste este daño')).toBeInTheDocument();

    await usuario.clear(screen.getByLabelText('Título'));
    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByText('Escribe un título para el reporte.')).toBeInTheDocument();
    expect(screen.queryByText('Ya reportaste este daño')).not.toBeInTheDocument();
    expect(crearReporte).toHaveBeenCalledTimes(1);
  });

  it('un título corto se marca en su campo y no se envía', async () => {
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);
    await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }));
    await screen.findByText('Municipalidad de Miraflores');
    await usuario.selectOptions(screen.getByLabelText('Tipo de daño'), '3');
    await usuario.type(screen.getByLabelText('Título'), 'Hoyo');
    await usuario.click(screen.getByRole('radio', { name: 'Alta' }));
    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    const mensaje = await screen.findByText(/al menos 5/);
    const titulo = screen.getByLabelText('Título');
    expect(titulo).toHaveAttribute('aria-invalid', 'true');
    expect(titulo.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(crearReporte).not.toHaveBeenCalled();
  });

  it('envía el título recortado y la severidad elegida', async () => {
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);

    await usuario.type(screen.getByLabelText('Título'), '  ');
    await llenarYEnviar(usuario);

    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(1));
    expect(crearReporte).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Bache profundo', severidad: 'ALTA' }),
    );
  });
});

describe('FormularioReporte sin conexión (US-06)', () => {
  it('NetworkError: encola con la misma clave y el siguiente reporte usa una nueva', async () => {
    encolar.mockResolvedValue(undefined);
    const onEncolado = vi.fn();
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={onEncolado} />);

    await llenarYEnviar(usuario);

    await waitFor(() => expect(onEncolado).toHaveBeenCalledTimes(1));
    expect(encolar).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: claveDe(0) }));

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(2));
    expect(claveDe(1)).not.toBe(claveDe(0));
  });

  it('sin IndexedDB: avisa y conserva la clave para el reintento manual', async () => {
    encolar.mockRejectedValue(new Error('sin IndexedDB'));
    const onEncolado = vi.fn();
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={onEncolado} />);

    await llenarYEnviar(usuario);

    expect(
      await screen.findByText(/Sin conexión. Tu reporte no se envió/),
    ).toBeInTheDocument();
    expect(onEncolado).not.toHaveBeenCalled();

    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(2));
    expect(claveDe(1)).toBe(claveDe(0));
  });
});

describe('FormularioReporte: la foto (DEP-11)', () => {
  const MB = 1024 * 1024;
  const SIN_TURNO =
    'Hay muchas fotos procesandose en este momento. Intenta de nuevo en unos segundos.';

  /** Un `File` que dice pesar `bytes` sin reservarlos. */
  function archivo(nombre: string, tipo: string, bytes: number): File {
    const f = new File(['x'], nombre, { type: tipo });
    Object.defineProperty(f, 'size', { value: bytes });
    return f;
  }

  beforeEach(() => {
    // jsdom no implementa las URL `blob:` de la vista previa.
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:vista-previa'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    // Primero se desmonta: la limpieza de la vista previa llama a
    // `revokeObjectURL`, y el `cleanup` de vitest.setup corre DESPUES de este
    // afterEach (los `after` van en orden inverso).
    cleanup();
    // Se quitan para no dejar el global de jsdom modificado en otros archivos.
    const urlMutable = URL as unknown as Record<string, unknown>;
    delete urlMutable.createObjectURL;
    delete urlMutable.revokeObjectURL;
  });

  it('una foto de más de 10 MB no viaja con el reporte (ni a la cola)', async () => {
    vi.mocked(crearReporte).mockResolvedValueOnce({ id: 40, esAdhesion: false } as ReporteCreado);
    const onCreado = vi.fn();
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={onCreado} onEncolado={vi.fn()} />);

    await usuario.upload(
      screen.getByLabelText('Foto del daño (opcional)'),
      archivo('bache.jpg', 'image/jpeg', 10 * MB + 1),
    );
    expect(screen.getByText('La foto supera 10 MB.')).toBeInTheDocument();
    await llenarYEnviar(usuario);

    await waitFor(() => expect(onCreado).toHaveBeenCalledTimes(1));
    expect(crearReporte).toHaveBeenCalledWith(expect.objectContaining({ foto: null }));
  });

  it('el 503 del saneado se muestra con el mensaje del API y el reporte no se encola', async () => {
    vi.mocked(crearReporte).mockRejectedValueOnce(new ApiError(503, SIN_TURNO, '/api/reportes'));
    const onEncolado = vi.fn();
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={onEncolado} />);
    const foto = archivo('bache.jpg', 'image/jpeg', 4 * MB);

    await usuario.upload(screen.getByLabelText('Foto del daño (opcional)'), foto);
    await llenarYEnviar(usuario);

    expect(await screen.findByText(SIN_TURNO)).toBeInTheDocument();
    expect(crearReporte).toHaveBeenCalledWith(expect.objectContaining({ foto }));
    expect(encolar).not.toHaveBeenCalled();
    expect(onEncolado).not.toHaveBeenCalled();
  });
});
