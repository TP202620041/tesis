import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { RecuperarPassword } from './RecuperarPassword';
import { reenviarConfirmacion, restablecerPassword, solicitarRecuperacion } from '../api';
import { AVISO_RECUPERACION_SIN_CONFIRMAR, MENSAJE_REENVIO } from '../model/confirmacion';

vi.mock('../api', () => ({
  solicitarRecuperacion: vi.fn(),
  restablecerPassword: vi.fn(),
  reenviarConfirmacion: vi.fn(),
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
const reenviar = vi.mocked(reenviarConfirmacion);

/** Pide el token con ese correo y devuelve el usuario de la prueba. */
async function pedirToken(correo: string) {
  solicitar.mockResolvedValue(undefined);
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Correo electrónico'), correo);
  await usuario.click(screen.getByRole('button', { name: 'Enviar token' }));
  await screen.findByLabelText('Token');
  return usuario;
}

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
    reenviar.mockReset();
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

  describe('NC-09c: cuenta sin confirmar', () => {
    it('tras pedir el token suma el aviso y la acción de reenviar el enlace', async () => {
      render(<RecuperarPassword />);
      await pedirToken('ana@correo.pe');

      // El aviso va en el mismo mensaje genérico, que se anuncia.
      const estado = screen.getByText(/Si ana@correo.pe está registrado/);
      expect(estado).toHaveAttribute('role', 'status');
      expect(estado).toHaveTextContent(AVISO_RECUPERACION_SIN_CONFIRMAR);
      expect(screen.getByRole('button', { name: 'Reenviar el enlace' })).toBeInTheDocument();
      // No se envía nada sin que la persona lo pida.
      expect(reenviar).not.toHaveBeenCalled();
    });

    it('reenvía al correo escrito, con el mensaje neutro y la espera de 60 s', async () => {
      reenviar.mockResolvedValue(undefined);
      render(<RecuperarPassword />);
      const usuario = await pedirToken(' ana@correo.pe ');

      const boton = screen.getByRole('button', { name: 'Reenviar el enlace' });
      await usuario.click(boton);

      expect(reenviar).toHaveBeenCalledWith('ana@correo.pe');
      // El mismo texto exista o no la cuenta: el backend responde 202 siempre.
      expect(await screen.findByText(MENSAJE_REENVIO)).toHaveAttribute('role', 'status');
      expect(boton).toHaveAttribute('aria-disabled', 'true');
      expect(boton).toHaveAccessibleDescription(/Podrás pedir otro enlace en 60 s/);

      // Durante la espera, otro clic no pide nada.
      await usuario.click(boton);
      expect(reenviar).toHaveBeenCalledTimes(1);
    });

    it('con «Ya tengo un token» no hay correo, así que no ofrece reenviar', async () => {
      render(<RecuperarPassword />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Ya tengo un token' }));

      expect(screen.getByRole('status')).toHaveTextContent('Ingresa el token que recibiste por correo.');
      expect(screen.queryByRole('button', { name: 'Reenviar el enlace' })).not.toBeInTheDocument();
      expect(screen.queryByText(new RegExp(AVISO_RECUPERACION_SIN_CONFIRMAR))).not.toBeInTheDocument();
    });

    it('al volver a pedir el token desaparece el reenvío', async () => {
      render(<RecuperarPassword />);
      const usuario = await pedirToken('ana@correo.pe');

      await usuario.click(screen.getByRole('button', { name: 'Pedir otro token' }));

      expect(screen.queryByRole('button', { name: 'Reenviar el enlace' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enviar token' })).toBeInTheDocument();
    });
  });
});
