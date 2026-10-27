import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { distritoPorCoordenadas, listarCategorias } from '@/lib/api/catalogos';
import { ApiError, NetworkError } from '@/lib/api/errors';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
import { clasificarFoto, crearReporte } from '../api';
import { useEncolarReporte } from '../hooks/useColaOffline';
import type { ReporteCreado } from '../model/tipos';
import { FormularioReporte } from './FormularioReporte';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../api', () => ({ crearReporte: vi.fn(), clasificarFoto: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ distritoPorCoordenadas: vi.fn(), listarCategorias: vi.fn() }));
vi.mock('../hooks/useColaOffline', () => ({ useEncolarReporte: vi.fn() }));

const encolar = vi.fn();

beforeEach(() => {
  vi.mocked(useEncolarReporte).mockReturnValue(encolar);
  vi.mocked(listarCategorias).mockResolvedValue([{ id: 3, nombre: 'Bache', esEstandar: true } as CategoriaDano]);
  vi.mocked(distritoPorCoordenadas).mockResolvedValue({ id: 1, nombre: 'Miraflores' } as Distrito);
  vi.mocked(crearReporte).mockRejectedValue(new NetworkError());
  // NC-04: por defecto la foto no sugiere nada (como en producción hasta NC-04b).
  vi.mocked(clasificarFoto).mockResolvedValue(null);
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
  vi.mocked(clasificarFoto).mockReset();
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

describe('FormularioReporte: la sugerencia por la foto (NC-04)', () => {
  const BACHE = { categoriaId: 3, categoriaNombre: 'Bache' };
  const foto = (nombre = 'bache.jpg') => new File(['x'], nombre, { type: 'image/jpeg' });
  const campoFoto = () => screen.getByLabelText('Foto del daño (opcional)');
  const selector = () => screen.getByLabelText<HTMLSelectElement>('Tipo de daño');

  /** Respuesta que llega cuando el test quiere; como `fetch`, cancelada da `NetworkError`. */
  function respuestaPendiente() {
    let resolver: (valor: typeof BACHE | null) => void = () => {};
    let senal: AbortSignal | undefined;
    vi.mocked(clasificarFoto).mockImplementationOnce(
      (_foto, signal) =>
        new Promise((res, rej) => {
          senal = signal;
          resolver = res;
          signal?.addEventListener('abort', () => rej(new NetworkError()));
        }),
    );
    return {
      resolver: (valor: typeof BACHE | null) => resolver(valor),
      cancelada: () => senal?.aborted,
    };
  }

  beforeEach(() => {
    vi.mocked(listarCategorias).mockResolvedValue([
      { id: 3, nombre: 'Bache', esEstandar: true },
      { id: 5, nombre: 'Vereda dañada', esEstandar: true },
    ] as CategoriaDano[]);
    // jsdom no implementa las URL `blob:` de la vista previa.
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:vista-previa'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    const urlMutable = URL as unknown as Record<string, unknown>;
    delete urlMutable.createObjectURL;
    delete urlMutable.revokeObjectURL;
  });

  it('la foto va antes del tipo de daño, que es lo que puede sugerir', () => {
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);
    const posicion = campoFoto().compareDocumentPosition(selector());
    expect(posicion & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('la sugerencia no elige sola: el selector sigue vacío hasta tocar «Elegir»', async () => {
    vi.mocked(clasificarFoto).mockResolvedValue(BACHE);
    vi.mocked(crearReporte).mockResolvedValueOnce({ id: 50, esAdhesion: false } as ReporteCreado);
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);
    await screen.findByRole('option', { name: 'Bache' });

    await usuario.upload(campoFoto(), foto());

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Sugerencia por la foto: Bache. Es automática: el tipo de daño lo eliges tú.',
      ),
    );
    expect(selector()).toHaveValue('');
    expect(selector()).toHaveAccessibleDescription(/^Sugerencia por la foto: Bache/);

    await usuario.click(screen.getByRole('button', { name: 'Elegir «Bache»' }));

    expect(selector()).toHaveValue('3');
    expect(selector()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Elegir «Bache»' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('el tipo que elegiste');

    await usuario.click(screen.getByRole('button', { name: 'Usar mi ubicación (GPS)' }));
    await screen.findByText('Municipalidad de Miraflores');
    await usuario.type(screen.getByLabelText('Título'), 'Bache profundo');
    await usuario.click(screen.getByRole('radio', { name: 'Alta' }));
    await usuario.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(1));
    // Solo la categoría que eligió el ciudadano: la sugerencia no viaja (D-08).
    const enviado = vi.mocked(crearReporte).mock.calls[0]?.[0];
    expect(enviado).toMatchObject({ categoriaId: 3 });
    expect(Object.keys(enviado ?? {}).some((k) => /sugerenc|confianza/i.test(k))).toBe(false);
  });

  it('una sugerencia que llega tarde no pisa la categoría que eligió el ciudadano', async () => {
    const respuesta = respuestaPendiente();
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);
    await screen.findByRole('option', { name: 'Vereda dañada' });

    await usuario.upload(campoFoto(), foto());
    await usuario.selectOptions(selector(), '5');
    await act(async () => respuesta.resolver(BACHE));

    expect(selector()).toHaveValue('5');
    expect(screen.getByRole('status')).toHaveTextContent('Sugerencia por la foto: Bache.');
    expect(screen.getByRole('button', { name: 'Elegir «Bache»' })).toBeInTheDocument();
  });

  it('mientras analiza, el selector y el envío siguen habilitados; enviar descarta la vista previa', async () => {
    const respuesta = respuestaPendiente();
    encolar.mockResolvedValue(undefined);
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);

    await usuario.upload(campoFoto(), foto());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Analizando la foto para sugerirte un tipo de daño…',
    );
    expect(selector()).toBeEnabled();

    await llenarYEnviar(usuario);

    await waitFor(() => expect(crearReporte).toHaveBeenCalledTimes(1));
    expect(respuesta.cancelada()).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(clasificarFoto).toHaveBeenCalledTimes(1);
  });

  it('sin sugerencia (o si la vista previa falla) lo dice y el formulario sigue igual', async () => {
    vi.mocked(clasificarFoto).mockRejectedValue(new NetworkError());
    vi.mocked(crearReporte).mockResolvedValueOnce({ id: 51, esAdhesion: false } as ReporteCreado);
    const onCreado = vi.fn();
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={onCreado} onEncolado={vi.fn()} />);

    await usuario.upload(campoFoto(), foto());

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'No hay una sugerencia para esta foto. Elige el tipo de daño en la lista.',
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await llenarYEnviar(usuario);
    await waitFor(() => expect(onCreado).toHaveBeenCalledTimes(1));
    expect(clasificarFoto).toHaveBeenCalledTimes(1);
  });

  it('el 409 de formato se avisa junto a la foto, sin bloquear el formulario', async () => {
    vi.mocked(clasificarFoto).mockRejectedValue(
      new ApiError(409, 'Formato de foto no permitido (usa JPG, PNG o WEBP)'),
    );
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);

    await usuario.upload(campoFoto(), foto('falsa.jpg'));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(
      'Formato de foto no permitido (usa JPG, PNG o WEBP). Elige otra foto o quítala',
    );
    expect(campoFoto()).toHaveAttribute('aria-invalid', 'true');
    expect(selector()).toBeEnabled();

    await usuario.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(campoFoto()).not.toHaveAttribute('aria-invalid');
  });

  it('una foto nueva descarta la sugerencia de la anterior', async () => {
    vi.mocked(clasificarFoto).mockResolvedValueOnce(BACHE);
    const usuario = userEvent.setup();
    render(<FormularioReporte usuarioId={7} onCreado={vi.fn()} onEncolado={vi.fn()} />);
    await screen.findByRole('option', { name: 'Bache' });

    await usuario.upload(campoFoto(), foto('a.jpg'));
    await screen.findByRole('button', { name: 'Elegir «Bache»' });

    const segunda = respuestaPendiente();
    await usuario.upload(campoFoto(), foto('b.jpg'));

    expect(screen.queryByRole('button', { name: 'Elegir «Bache»' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Analizando la foto');
    await act(async () => segunda.resolver(null));
    expect(screen.getByRole('status')).toHaveTextContent('No hay una sugerencia para esta foto');
  });
});
