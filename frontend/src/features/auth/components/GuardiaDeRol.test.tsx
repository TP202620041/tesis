import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Rol, Usuario } from '@/lib/types/domain';
import { GuardiaDeRol } from './GuardiaDeRol';
import { useSesion } from '../hooks/useSesion';
import { ROLES_AREA_ADMIN, ROLES_AREA_MUNICIPAL, ROLES_CON_SESION } from '../model/rutas';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../hooks/useSesion', () => ({ useSesion: vi.fn() }));

const sesion = vi.mocked(useSesion);

function comoRol(rol: Rol) {
  const usuario: Usuario = {
    id: 1,
    email: 'u@lima.pe',
    nombre: 'Ana',
    apellido: 'Vecina',
    rol,
    preferenciaNotificacion: 'EMAIL',
  };
  sesion.mockReturnValue({ estado: 'autenticado', usuario, refrescar: vi.fn() });
}

describe('GuardiaDeRol', () => {
  beforeEach(() => sesion.mockReset());

  it('explica el área municipal a quien no es funcionario', () => {
    comoRol('CIUDADANO');
    render(<GuardiaDeRol rolesPermitidos={ROLES_AREA_MUNICIPAL}>{() => 'dentro'}</GuardiaDeRol>);
    expect(screen.getByText(/El área municipal es para funcionarios/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi inicio' })).toHaveAttribute(
      'href',
      '/mis-reportes',
    );
  });

  it('explica el área de administración y no habla de la bandeja municipal', () => {
    comoRol('FUNCIONARIO_MUNICIPAL');
    render(<GuardiaDeRol rolesPermitidos={ROLES_AREA_ADMIN}>{() => 'dentro'}</GuardiaDeRol>);
    expect(screen.getByText(/El área de administración/)).toBeInTheDocument();
    expect(screen.queryByText(/municipal es para/)).not.toBeInTheDocument();
  });

  it('deja pasar a cualquier rol a las páginas de sesión', () => {
    comoRol('ADMIN');
    render(<GuardiaDeRol rolesPermitidos={ROLES_CON_SESION}>{() => 'dentro'}</GuardiaDeRol>);
    expect(screen.getByText('dentro')).toBeInTheDocument();
  });
});
