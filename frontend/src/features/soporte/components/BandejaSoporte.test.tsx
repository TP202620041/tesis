import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BandejaSoporte } from './BandejaSoporte';
import { listarTickets, responderTicket } from '../api';
import type { PaginaTickets, TicketAdmin } from '../model/tipos';

vi.mock('../api', () => ({ listarTickets: vi.fn(), responderTicket: vi.fn() }));

const listar = vi.mocked(listarTickets);
const responder = vi.mocked(responderTicket);

const TICKET: TicketAdmin = {
  id: 42,
  asunto: 'No puedo subir foto',
  mensaje: 'El botón no responde',
  estado: 'ABIERTO',
  respuesta: null,
  emailContacto: 'ana@lima.pe',
  nombreAutor: null,
  createdAt: '2026-10-13T23:10:05Z',
  updatedAt: '2026-10-13T23:10:05Z',
};

function pagina(extra: Partial<PaginaTickets> = {}): PaginaTickets {
  return { tickets: [TICKET], pagina: 0, totalPaginas: 2, total: 21, ...extra };
}

describe('BandejaSoporte', () => {
  beforeEach(() => {
    listar.mockReset();
    responder.mockReset();
  });

  it('muestra contacto y autor (o su ausencia) de cada ticket', async () => {
    listar.mockResolvedValue(pagina());
    render(<BandejaSoporte />);

    const item = await screen.findByRole('listitem');
    expect(within(item).getByText('ana@lima.pe')).toBeInTheDocument();
    expect(within(item).getByText('Sin cuenta asociada')).toBeInTheDocument();
    expect(listar).toHaveBeenCalledWith({ estado: null, pagina: 0 });
  });

  it('filtra por estado desde la primera página y pagina hacia adelante', async () => {
    listar.mockResolvedValue(pagina());
    render(<BandejaSoporte />);
    const usuario = userEvent.setup();
    await screen.findByRole('listitem');

    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(listar).toHaveBeenLastCalledWith({ estado: null, pagina: 1 });

    await usuario.selectOptions(screen.getByLabelText('Estado', { selector: '#filtro-estado-ticket' }), 'CERRADO');
    expect(listar).toHaveBeenLastCalledWith({ estado: 'CERRADO', pagina: 0 });
  });

  it('responde con el estado elegido y recarga la página actual', async () => {
    listar.mockResolvedValue(pagina());
    responder.mockResolvedValue({ ...TICKET, estado: 'CERRADO', respuesta: 'Corregido' });
    render(<BandejaSoporte />);
    const usuario = userEvent.setup();
    const item = await screen.findByRole('listitem');

    await usuario.type(within(item).getByLabelText('Respuesta'), 'Corregido');
    await usuario.click(within(item).getByRole('button', { name: 'Enviar respuesta' }));

    // Al responder un ABIERTO se propone CERRADO.
    expect(responder).toHaveBeenCalledWith(42, { respuesta: 'Corregido', estado: 'CERRADO' });
    await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  });

  it('no envía una respuesta vacía', async () => {
    listar.mockResolvedValue(pagina());
    render(<BandejaSoporte />);
    const item = await screen.findByRole('listitem');

    await userEvent.setup().click(within(item).getByRole('button', { name: 'Enviar respuesta' }));

    expect(responder).not.toHaveBeenCalled();
    expect(within(item).getByText('Escribe la respuesta.')).toBeInTheDocument();
  });
});
