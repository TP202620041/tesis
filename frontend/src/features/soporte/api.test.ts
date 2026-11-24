import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api/client';
import { aPaginaTickets, aTicketAdmin, aTicketPropio, listarTickets, responderTicket } from './api';

vi.mock('@/lib/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const get = vi.mocked(api.get);
const patch = vi.mocked(api.patch);

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
});

describe('aTicketAdmin', () => {
  it('conserva los null de respuesta y autor (ticket de visitante sin responder)', () => {
    const t = aTicketAdmin({
      id: 42,
      asunto: 'No puedo subir foto',
      mensaje: 'El botón no responde',
      estado: 'ABIERTO',
      emailContacto: 'ana@lima.pe',
      createdAt: '2026-10-13T23:10:05Z',
      updatedAt: '2026-10-13T23:10:05Z',
    });
    expect(t.respuesta).toBeNull();
    expect(t.nombreAutor).toBeNull();
    expect(t.estado).toBe('ABIERTO');
    // Backend anterior: sin número de seguimiento.
    expect(t.numeroSeguimiento).toBeNull();
  });

  it('toma el número de seguimiento del servidor; el ADMIN no recibe plazo', () => {
    const t = aTicketAdmin({ id: 42, numeroSeguimiento: 'SOP-000042', estado: 'ABIERTO' });
    expect(t.numeroSeguimiento).toBe('SOP-000042');
    expect(t.plazoRespuestaHoras).toBeNull();
    expect(t.respuestaEsperadaAntesDe).toBeNull();
  });
});

describe('aTicketPropio', () => {
  it('trae el número, el plazo y la fecha límite (US-25 Esc. 1)', () => {
    const t = aTicketPropio({
      id: 123,
      numeroSeguimiento: 'SOP-000123',
      asunto: 'No puedo subir foto',
      mensaje: 'El botón no responde',
      estado: 'ABIERTO',
      createdAt: '2026-11-23T15:00:00Z',
      plazoRespuestaHoras: 48,
      respuestaEsperadaAntesDe: '2026-11-25T15:00:00Z',
    });
    expect(t).toMatchObject({
      numeroSeguimiento: 'SOP-000123',
      plazoRespuestaHoras: 48,
      respuestaEsperadaAntesDe: '2026-11-25T15:00:00Z',
      respuesta: null,
    });
  });
});

describe('aPaginaTickets', () => {
  it('traduce la página de Spring y nunca da 0 páginas', () => {
    expect(aPaginaTickets({ content: [], number: 0, totalPages: 0, totalElements: 0 })).toEqual({
      tickets: [],
      pagina: 0,
      totalPaginas: 1,
      total: 0,
    });
  });
});

describe('listarTickets', () => {
  it('pide la página con el filtro de estado', async () => {
    get.mockResolvedValue({ content: [], number: 1, totalPages: 2, totalElements: 21 });
    const pagina = await listarTickets({ estado: 'CERRADO', pagina: 1 });
    expect(get).toHaveBeenCalledWith('/api/soporte/tickets?estado=CERRADO&page=1&size=20');
    expect(pagina.total).toBe(21);
  });
});

describe('responderTicket', () => {
  it('envía la respuesta recortada y el estado', async () => {
    patch.mockResolvedValue({ id: 7, estado: 'CERRADO', respuesta: 'Hecho' });
    await responderTicket(7, { respuesta: '  Hecho  ', estado: 'CERRADO' });
    expect(patch).toHaveBeenCalledWith('/api/soporte/tickets/7/responder', {
      respuesta: 'Hecho',
      estado: 'CERRADO',
    });
  });
});
