import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { SoporteUsuario } from './SoporteUsuario';
import { crearTicket, misTickets } from '../api';
import type { TicketPropio } from '../model/tipos';

vi.mock('../api', () => ({ crearTicket: vi.fn(), misTickets: vi.fn() }));

const crear = vi.mocked(crearTicket);
const listar = vi.mocked(misTickets);

const RESPONDIDO: TicketPropio = {
  id: 1,
  asunto: 'No puedo subir foto',
  mensaje: 'El botón no responde',
  estado: 'CERRADO',
  respuesta: 'Ya quedó corregido',
  createdAt: '2026-10-10T12:00:00Z',
};

describe('SoporteUsuario', () => {
  beforeEach(() => {
    crear.mockReset();
    listar.mockReset();
  });

  it('lista mis tickets con su estado y la respuesta de soporte', async () => {
    listar.mockResolvedValue([
      RESPONDIDO,
      { ...RESPONDIDO, id: 2, asunto: 'Otra duda', estado: 'ABIERTO', respuesta: null },
    ]);
    render(<SoporteUsuario />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Cerrado')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Ya quedó corregido')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Abierto')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Aún sin respuesta.')).toBeInTheDocument();
    // US-25: cada consulta muestra su número de seguimiento.
    expect(items[0]).toHaveTextContent('Número de seguimiento #1');
    expect(items[1]).toHaveTextContent('Número de seguimiento #2');
  });

  it('no envía un ticket sin asunto', async () => {
    listar.mockResolvedValue([]);
    render(<SoporteUsuario />);
    const usuario = userEvent.setup();

    await usuario.type(screen.getByLabelText('Mensaje'), 'Hola');
    await usuario.click(screen.getByRole('button', { name: 'Enviar consulta' }));

    expect(crear).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el asunto.')).toBeInTheDocument();
  });

  it('crea el ticket, limpia el formulario y recarga la lista', async () => {
    listar.mockResolvedValueOnce([]).mockResolvedValueOnce([RESPONDIDO]);
    crear.mockResolvedValue({ ...RESPONDIDO, estado: 'ABIERTO', respuesta: null });
    render(<SoporteUsuario />);
    const usuario = userEvent.setup();

    await usuario.type(screen.getByLabelText('Asunto'), 'No puedo subir foto');
    await usuario.type(screen.getByLabelText('Mensaje'), 'El botón no responde');
    await usuario.click(screen.getByRole('button', { name: 'Enviar consulta' }));

    expect(crear).toHaveBeenCalledWith({
      asunto: 'No puedo subir foto',
      mensaje: 'El botón no responde',
    });
    expect(await screen.findByText('Recibimos tu consulta')).toBeInTheDocument();
    // US-25 Esc. 1: número de seguimiento (el id del API) y plazo de atención.
    expect(
      screen.getByText(
        'Registramos tu consulta con el número de seguimiento #1. Te responderemos en un plazo de 2 días hábiles, aquí y al correo de tu cuenta.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Asunto')).toHaveValue('');
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('muestra el error del backend', async () => {
    listar.mockResolvedValue([]);
    crear.mockRejectedValue(new ApiError(400, 'Datos invalidos', '', ['asunto: no debe estar vacio']));
    render(<SoporteUsuario />);
    const usuario = userEvent.setup();

    await usuario.type(screen.getByLabelText('Asunto'), 'A');
    await usuario.type(screen.getByLabelText('Mensaje'), 'B');
    await usuario.click(screen.getByRole('button', { name: 'Enviar consulta' }));

    expect(await screen.findByText('Datos invalidos')).toBeInTheDocument();
    expect(screen.getByText('asunto: no debe estar vacio')).toBeInTheDocument();
  });
});
