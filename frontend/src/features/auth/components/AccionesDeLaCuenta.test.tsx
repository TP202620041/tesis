import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Usuario } from '@/lib/types/domain';
import { AccionesDeLaCuenta } from './AccionesDeLaCuenta';
import { MiCuenta } from './MiCuenta';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
// El cierre real (preguntas de la cola, push, navegación) lo cubre BotonCerrarSesion.test.
vi.mock('./BotonCerrarSesion', () => ({
  BotonCerrarSesion: () => <button type="button">Cerrar sesión</button>,
}));

const LUIS = {
  id: 9,
  email: 'luis@miraflores.gob.pe',
  nombre: 'Luis',
  apellido: 'Gestor',
  rol: 'FUNCIONARIO_MUNICIPAL',
  distritoNombre: 'Miraflores',
  preferenciaNotificacion: 'EMAIL',
  debeAceptarTerminos: false,
} as Usuario;

const seccion = () => screen.getByRole('region', { name: 'Otras opciones' });

describe('AccionesDeLaCuenta: el final de la pantalla de «Cuenta»', () => {
  it('ciudadano: Soporte y «Cerrar sesión» (Mi perfil ya es esta pantalla)', () => {
    render(<AccionesDeLaCuenta rol="CIUDADANO" />);
    const enlaces = within(seccion()).getAllByRole('link');
    expect(enlaces.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Soporte', '/soporte']]);
    expect(within(seccion()).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('funcionario: Soporte e Índice público; admin: solo «Cerrar sesión»', () => {
    const { unmount } = render(<AccionesDeLaCuenta rol="FUNCIONARIO_MUNICIPAL" />);
    expect(within(seccion()).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/soporte', '/desempeno']);
    unmount();

    render(<AccionesDeLaCuenta rol="ADMIN" />);
    expect(within(seccion()).queryAllByRole('link')).toEqual([]);
    expect(within(seccion()).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });
});

describe('MiCuenta: «Mi perfil» de quien no tiene perfil editable', () => {
  it('quién es, la apariencia, sus enlaces y «Cerrar sesión»', () => {
    render(<MiCuenta usuario={LUIS} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByText('Luis Gestor')).toBeInTheDocument();
    expect(screen.getByText('Municipalidad de Miraflores')).toBeInTheDocument();
    expect(screen.getByText('luis@miraflores.gob.pe')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Apariencia' })).toBeInTheDocument();
    expect(within(seccion()).getByRole('link', { name: 'Soporte' })).toHaveAttribute('href', '/soporte');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    // Nada que editar: el backend solo acepta cambios de perfil del ciudadano.
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
  });
});
