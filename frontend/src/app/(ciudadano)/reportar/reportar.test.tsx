import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useSesion } from '@/features/auth/hooks/useSesion';
import type { Rol, Usuario } from '@/lib/types/domain';
import ReportarPage from './page';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/features/auth/hooks/useSesion', () => ({ useSesion: vi.fn() }));
vi.mock('@/features/auth/components/BotonCerrarSesion', () => ({
  BotonCerrarSesion: () => <button type="button">Cerrar sesión</button>,
}));
vi.mock('@/features/reportes/components/NuevoReporte', () => ({
  NuevoReporte: ({ usuarioId }: { usuarioId: number }) => <p>Formulario del usuario {usuarioId}</p>,
}));

function comoRol(rol: Rol) {
  const usuario: Usuario = {
    id: 7,
    email: 'u@lima.pe',
    nombre: 'Ana',
    apellido: 'Vecina',
    rol,
    preferenciaNotificacion: 'EMAIL',
    debeAceptarTerminos: false,
  };
  vi.mocked(useSesion).mockReturnValue({ estado: 'autenticado', usuario, refrescar: vi.fn() });
}

beforeEach(() => {
  vi.mocked(useSesion).mockReset();
  replace.mockReset();
});

describe('/reportar (QA-1 M-10)', () => {
  it('el ciudadano ve el formulario', () => {
    comoRol('CIUDADANO');
    render(<ReportarPage />);
    expect(screen.getByText('Formulario del usuario 7')).toBeInTheDocument();
  });

  it('QA-1 E-3: tiene salida a «Mis reportes» y al mapa, no solo «Cerrar sesión»', () => {
    comoRol('CIUDADANO');
    render(<ReportarPage />);
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(nav).toContainElement(screen.getByRole('link', { name: 'Mis reportes' }));
    expect(screen.getByRole('link', { name: 'Mis reportes' })).toHaveAttribute('href', '/mis-reportes');
    expect(screen.getByRole('link', { name: 'Ver el mapa' })).toHaveAttribute('href', '/mapa');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it.each(['FUNCIONARIO_MUNICIPAL', 'ADMIN'] as const)(
    '%s no llega a completar un formulario que el backend le rechazaría',
    (rol) => {
      comoRol(rol);
      render(<ReportarPage />);
      expect(screen.queryByText(/Formulario del usuario/)).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Esta sección no es para tu cuenta' })).toBeInTheDocument();
      expect(screen.getByText(/es para ciudadanos que reportan daños viales/)).toBeInTheDocument();
    },
  );

  it('sin sesión lleva al login y vuelve a /reportar', () => {
    vi.mocked(useSesion).mockReturnValue({ estado: 'anonimo', refrescar: vi.fn() });
    window.history.replaceState(null, '', '/reportar');
    render(<ReportarPage />);
    expect(replace).toHaveBeenCalledWith('/login?redirect=%2Freportar');
  });
});
