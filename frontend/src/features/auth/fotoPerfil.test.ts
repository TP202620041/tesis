import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();

// Se mockea el cliente para observar CÓMO se pide la foto, que es lo que
// aquí puede estar mal: sin `comoBlob` el cliente devolvería la imagen
// interpretada como texto, y sin token el backend responde 401.
vi.mock('@/lib/api/client', async () => {
  const real = await vi.importActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...real, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const { descargarFotoDePerfil } = await import('./fotoPerfil');

describe('descargarFotoDePerfil', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:local/123'),
    });
  });

  it('pide la foto de perfil como blob y no como texto', async () => {
    apiFetch.mockResolvedValue(new Blob(['x']));

    const src = await descargarFotoDePerfil('/api/perfiles/fotos/abc.png');

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/perfiles/fotos/abc.png',
      expect.objectContaining({ comoBlob: true }),
    );
    // Devuelve una URL local, no la ruta del API: es lo único que un
    // <img src> puede resolver sin poder mandar la cabecera Authorization.
    expect(src).toBe('blob:local/123');
  });

  it('no da el rodeo para una foto pública', async () => {
    // Las fotos de reporte se sirven como estático público: pedirlas con
    // fetch y convertirlas a blob sería trabajo inútil.
    const src = await descargarFotoDePerfil('/media/fotos/reportes/abc.png');

    expect(apiFetch).not.toHaveBeenCalled();
    expect(src).toBe('/media/fotos/reportes/abc.png');
  });
});
