import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api/client';
import { aPaginaTickets, aTicketAdmin, listarTickets, responderTicket } from './api';

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
