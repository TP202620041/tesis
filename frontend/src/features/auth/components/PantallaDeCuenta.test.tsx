import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Usuario } from '@/lib/types/domain';
import { useUsuarioDelMarco } from '../hooks/useUsuarioDelMarco';
import { PantallaDeCuenta } from './PantallaDeCuenta';

vi.mock('../hooks/useUsuarioDelMarco', () => ({ useUsuarioDelMarco: vi.fn() }));
// La guardia real (login, términos, roles) la cubre GuardiaDeRol.test; aquí
// solo importa qué pantalla elige y que sin red no se llegue a ella.
const { guardia } = vi.hoisted(() => ({ guardia: { usuario: null as Usuario | null, roles: [] as string[] } }));
vi.mock('./GuardiaDeRol', () => ({
  GuardiaDeRol: ({ rolesPermitidos, children }: { rolesPermitidos: string[]; children: (u: Usuario) => ReactNode }) => {
    guardia.roles = rolesPermitidos;
    return <>{children(guardia.usuario!)}</>;
  },
}));
vi.mock('./EditarPerfil', () => ({ EditarPerfil: () => <p>Perfil editable del ciudadano</p> }));
vi.mock('./MiCuenta', () => ({ MiCuenta: () => <p>Cuenta sin perfil editable</p> }));
vi.mock('./BotonCerrarSesion', () => ({
  BotonCerrarSesion: () => <button type="button">Cerrar sesión</button>,
}));

const ANA = {
  id: 7,
  email: 'ana@lima.pe',
  nombre: 'Ana',
  apellido: 'Vecina',
  rol: 'CIUDADANO',
  preferenciaNotificacion: 'EMAIL',
  debeAceptarTerminos: false,
} as Usuario;

afterEach(() => {
  vi.mocked(useUsuarioDelMarco).mockReset();
  guardia.usuario = null;
  guardia.roles = [];
});

describe('PantallaDeCuenta: «Cuenta» del móvil (/perfil)', () => {
  it('sin red y con sesión: el aviso, la apariencia y «Cerrar sesión», sin pasar por la guardia', () => {
    // La guardia tomaría el fallo de /me como «sin sesión» y mandaría al login:
    // en el móvil no quedaría cómo salir.
    vi.mocked(useUsuarioDelMarco).mockReturnValue({ estado: 'sin-identificar' });
    render(<PantallaDeCuenta textoLegal={null} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No se pudo cargar tu cuenta: revisa tu conexión.');
    expect(screen.getByRole('group', { name: 'Apariencia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(guardia.roles).toEqual([]);
  });

  it('ciudadano: su perfil editable; la guardia admite a los tres roles', () => {
    vi.mocked(useUsuarioDelMarco).mockReturnValue({ estado: 'identificado', usuario: ANA });
    guardia.usuario = ANA;
    render(<PantallaDeCuenta textoLegal={null} />);
    expect(screen.getByText('Perfil editable del ciudadano')).toBeInTheDocument();
    expect(guardia.roles).toEqual(['CIUDADANO', 'FUNCIONARIO_MUNICIPAL', 'ADMIN']);
  });

  it('funcionario y admin: la cuenta sin perfil editable', () => {
    for (const rol of ['FUNCIONARIO_MUNICIPAL', 'ADMIN'] as const) {
      const usuario = { ...ANA, rol } as Usuario;
      vi.mocked(useUsuarioDelMarco).mockReturnValue({ estado: 'identificado', usuario });
      guardia.usuario = usuario;
      const { unmount } = render(<PantallaDeCuenta textoLegal={null} />);
      expect(screen.getByText('Cuenta sin perfil editable')).toBeInTheDocument();
      expect(screen.queryByText('Perfil editable del ciudadano')).toBeNull();
      unmount();
    }
  });

  it('mientras averigua quién es, espera', () => {
    vi.mocked(useUsuarioDelMarco).mockReturnValue({ estado: 'cargando' });
    render(<PantallaDeCuenta textoLegal={null} />);
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
    expect(guardia.roles).toEqual([]);
  });
});
