import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarToken, guardarToken } from '@/lib/auth/token-storage';
import {
  aDenuncia,
  aFilaDeModeracion,
  aReporteEnModeracion,
  bandejaDeModeracion,
  descargarFotoModerada,
  desestimarDenuncias,
  ocultarContenido,
  restablecerContenido,
} from './api';

/*
 * NC-11b: el gateway de moderacion sobre el cliente real con `fetch` falso:
 * lo que de verdad sale hacia el backend (rutas, query, cuerpo, token).
 */

const fetchFalso = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchFalso.mockReset();
  vi.stubGlobal('fetch', fetchFalso);
  guardarToken('token-admin');
});

afterEach(() => {
  vi.unstubAllGlobals();
  borrarToken();
});

function ultimaLlamada() {
  const [url, init] = fetchFalso.mock.calls.at(-1) ?? [];
  return { url: String(url), init, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined };
}

const PAGINA_VACIA = { content: [], totalElements: 0, totalPages: 0, number: 0 };

describe('bandejaDeModeracion', () => {
  it('con un estado manda `estado`; con «Ocultos», `ocultos=true` y sin `estado`; siempre con token', async () => {
    fetchFalso.mockImplementation(() => Promise.resolve(Response.json(PAGINA_VACIA)));

    await bandejaDeModeracion({ vista: 'ATENDIDA', pagina: 1 });
    expect(ultimaLlamada().url).toMatch(/\/api\/admin\/moderacion\/reportes\?estado=ATENDIDA&page=1&size=20$/);
    expect(new Headers(ultimaLlamada().init?.headers).get('Authorization')).toBe('Bearer token-admin');

    const pagina = await bandejaDeModeracion({ vista: 'OCULTOS', pagina: 0 });
    expect(ultimaLlamada().url).toMatch(/\?ocultos=true&page=0&size=20$/);
    // Una pagina vacia sigue teniendo al menos una pagina.
    expect(pagina).toEqual({ filas: [], pagina: 0, totalPaginas: 1, total: 0 });
  });
});

describe('traducción de los DTO', () => {
  it('una fila con denuncias y otra oculta sin denuncias (vista «Ocultos»)', () => {
    expect(
      aFilaDeModeracion({
        reporteId: 42,
        titulo: 'Bache',
        estado: 'RECIBIDO',
        distritoNombre: 'Miraflores',
        tieneFoto: true,
        oculto: false,
        fotoOculta: true,
        totalDenuncias: 2,
        porMotivo: { DATOS_PERSONALES: 2 },
        primeraDenuncia: '2026-10-29T14:50:00Z',
        ultimaDenuncia: '2026-10-29T15:00:00Z',
      }),
    ).toEqual({
      reporteId: 42,
      titulo: 'Bache',
      estado: 'RECIBIDO',
      distritoNombre: 'Miraflores',
      tieneFoto: true,
      oculto: false,
      fotoOculta: true,
      totalDenuncias: 2,
      porMotivo: { DATOS_PERSONALES: 2 },
      primeraDenuncia: '2026-10-29T14:50:00Z',
      ultimaDenuncia: '2026-10-29T15:00:00Z',
    });
    expect(aFilaDeModeracion({ reporteId: 7, oculto: true })).toMatchObject({
      distritoNombre: null,
      totalDenuncias: 0,
      porMotivo: {},
      primeraDenuncia: null,
      ultimaDenuncia: null,
    });
  });

  it('la denuncia con su denunciante, y anónima si la cuenta se cerró (BE-14)', () => {
    expect(
      aDenuncia({
        id: 7,
        motivo: 'DATOS_PERSONALES',
        estado: 'ATENDIDA',
        createdAt: '2026-10-29T14:50:00Z',
        denuncianteId: 31,
        denuncianteNombre: 'Ana Vecina',
        denuncianteEmail: 'ana@ejemplo.pe',
        resueltaEn: '2026-10-29T15:10:00Z',
        motivoResolucion: 'Placa visible',
      }),
    ).toEqual({
      id: 7,
      motivo: 'DATOS_PERSONALES',
      estado: 'ATENDIDA',
      detalle: null,
      createdAt: '2026-10-29T14:50:00Z',
      denunciante: { id: 31, nombre: 'Ana Vecina', email: 'ana@ejemplo.pe' },
      resueltaEn: '2026-10-29T15:10:00Z',
      motivoResolucion: 'Placa visible',
    });
    expect(aDenuncia({ id: 8, motivo: 'OTRO', estado: 'PENDIENTE' })).toMatchObject({
      denunciante: null,
      resueltaEn: null,
      motivoResolucion: null,
    });
    // Un estado desconocido se trata como pendiente: hay que mirarlo.
    expect(aDenuncia({ id: 9, estado: 'RARO' }).estado).toBe('PENDIENTE');
  });

  it('el reporte en moderación, con la severidad tipada y las denuncias en orden', () => {
    const r = aReporteEnModeracion({
      id: 42,
      titulo: 'Bache',
      severidad: 'MEDIA',
      estado: 'RECIBIDO',
      tieneFoto: true,
      oculto: false,
      fotoOculta: true,
      denuncias: [{ id: 1, estado: 'ATENDIDA' }, { id: 2, estado: 'PENDIENTE' }],
    });
    expect(r).toMatchObject({ severidad: 'MEDIA', tieneFoto: true, fotoOculta: true, descripcion: null });
    expect(r.denuncias.map((d) => d.id)).toEqual([1, 2]);
    expect(aReporteEnModeracion({ id: 1, severidad: 'RARA' }).severidad).toBeNull();
  });
});

describe('acciones del ADMIN', () => {
  it('ocultar y restablecer envían alcance y motivo recortado', async () => {
    fetchFalso.mockImplementation(() => Promise.resolve(Response.json({ id: 42, oculto: true })));

    await ocultarContenido(42, { alcance: 'FOTO', motivo: '  La foto muestra una placa  ' });
    expect(ultimaLlamada().url).toMatch(/\/api\/admin\/moderacion\/reportes\/42\/ocultamiento$/);
    expect(ultimaLlamada().init?.method).toBe('POST');
    expect(ultimaLlamada().cuerpo).toEqual({ alcance: 'FOTO', motivo: 'La foto muestra una placa' });

    await restablecerContenido(42, { alcance: 'REPORTE', motivo: 'Fue un error' });
    expect(ultimaLlamada().url).toMatch(/\/42\/restablecimiento$/);
    expect(ultimaLlamada().cuerpo).toEqual({ alcance: 'REPORTE', motivo: 'Fue un error' });
  });

  it('desestimar: con motivo lo manda; sin motivo, sin cuerpo (es opcional)', async () => {
    fetchFalso.mockImplementation(() => Promise.resolve(Response.json({ id: 42 })));

    await desestimarDenuncias(42, ' No es contenido indebido ');
    expect(ultimaLlamada().url).toMatch(/\/42\/desestimacion$/);
    expect(ultimaLlamada().cuerpo).toEqual({ motivo: 'No es contenido indebido' });

    await desestimarDenuncias(42, '   ');
    expect(ultimaLlamada().init?.body).toBeUndefined();
    expect(new Headers(ultimaLlamada().init?.headers).has('Content-Type')).toBe(false);
  });

  it('la foto se trae con el token como blob y se vuelve URL `blob:`', async () => {
    fetchFalso.mockResolvedValue(
      new Response(new Blob(['jpg'], { type: 'image/jpeg' }), { status: 200, headers: { 'Content-Type': 'image/jpeg' } }),
    );
    const crear = vi.fn(() => 'blob:foto');
    vi.stubGlobal('URL', { ...URL, createObjectURL: crear });

    const url = await descargarFotoModerada(42);

    expect(url).toBe('blob:foto');
    expect(ultimaLlamada().url).toMatch(/\/api\/admin\/moderacion\/reportes\/42\/foto$/);
    expect(new Headers(ultimaLlamada().init?.headers).get('Authorization')).toBe('Bearer token-admin');
    expect(crear).toHaveBeenCalledWith(expect.any(Blob));
  });
});
