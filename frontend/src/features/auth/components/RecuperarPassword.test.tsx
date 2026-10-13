import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { RecuperarPassword } from './RecuperarPassword';
import { restablecerPassword, solicitarRecuperacion } from '../api';

vi.mock('../api', () => ({
  solicitarRecuperacion: vi.fn(),
  restablecerPassword: vi.fn(),
}));

// next/link fuera del árbol de Next: basta con un <a> para estas pruebas.
vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

const solicitar = vi.mocked(solicitarRecuperacion);
const restablecer = vi.mocked(restablecerPassword);

async function llenarPasoToken(token: string, password: string, confirmacion = password) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Token'), token);
  await usuario.type(screen.getByLabelText(/Contraseña nueva/), password);
  await usuario.type(screen.getByLabelText('Repite la contraseña nueva'), confirmacion);
  await usuario.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
}

describe('RecuperarPassword', () => {
  beforeEach(() => {
    solicitar.mockReset();
    restablecer.mockReset();
  });

  it('pide el token y pasa al segundo paso sin confirmar que la cuenta exista', async () => {
    solicitar.mockResolvedValue(undefined);
    render(<RecuperarPassword />);
    const usuario = userEvent.setup();

    await usuario.type(screen.getByLabelText('Correo electrónico'), ' ana@correo.pe ');
    await usuario.click(screen.getByRole('button', { name: 'Enviar token' }));

    expect(solicitar).toHaveBeenCalledWith({ email: 'ana@correo.pe' });
    expect(await screen.findByText(/Si ana@correo.pe está registrado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Token')).toBeInTheDocument();
  });

  it('restablece con el token limpio y ofrece volver al login', async () => {
    restablecer.mockResolvedValue(undefined);
    render(<RecuperarPassword />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ya tengo un token' }));

    await llenarPasoToken(' abc-123 ', 'nuevaClave9');

    expect(restablecer).toHaveBeenCalledWith({ token: 'abc-123', nuevaPassword: 'nuevaClave9' });
    expect(await screen.findByText(/Tu contraseña se actualizó/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute('href', '/login');
  });

  it('no envía si la contraseña no cumple las reglas del registro', async () => {
    render(<RecuperarPassword />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ya tengo un token' }));

    await llenarPasoToken('abc-123', 'corta', 'distinta');

    expect(restablecer).not.toHaveBeenCalled();
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  });

  it('muestra el mensaje del backend si el token venció', async () => {
    restablecer.mockRejectedValue(new ApiError(409, 'El token de recuperacion vencio'));
    render(<RecuperarPassword />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ya tengo un token' }));

    await llenarPasoToken('abc-123', 'nuevaClave9');

    expect(await screen.findByText('El token de recuperacion vencio')).toBeInTheDocument();
    expect(screen.getByLabelText('Token')).toBeInTheDocument();
  });
});
