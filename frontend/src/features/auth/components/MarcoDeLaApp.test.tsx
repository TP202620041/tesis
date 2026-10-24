import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Usuario } from '@/lib/types/domain';
import { useUsuarioDelMarco, type UsuarioDelMarco } from '../hooks/useUsuarioDelMarco';
import { MarcoDeLaApp } from './MarcoDeLaApp';

const { ruta } = vi.hoisted(() => ({ ruta: { actual: '/mapa' } }));
vi.mock('next/navigation', () => ({ usePathname: () => ruta.actual }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('../hooks/useUsuarioDelMarco', () => ({ useUsuarioDelMarco: vi.fn() }));
// El cierre real (preguntas de la cola, push, navegación) lo cubre BotonCerrarSesion.test.
vi.mock('./BotonCerrarSesion', () => ({
  BotonCerrarSesion: ({ alActivar }: { alActivar?: () => void }) => (
    <button type="button" onClick={alActivar}>
      Cerrar sesión
    </button>
  ),
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

function como(usuario: UsuarioDelMarco, en = '/mapa') {
  ruta.actual = en;
  vi.mocked(useUsuarioDelMarco).mockReturnValue(usuario);
  return render(
    <MarcoDeLaApp>
      <p>Contenido de la página</p>
    </MarcoDeLaApp>,
  );
}

/** En jsdom no hay CSS: la cabecera (escritorio) y la barra (móvil) están las dos. */
const barraInferior = () => screen.getAllByRole('navigation', { name: 'Principal' }).at(-1)!;

afterEach(() => {
  vi.mocked(useUsuarioDelMarco).mockReset();
});

describe('MarcoDeLaApp (DIS-1)', () => {
  it('envuelve el contenido con el logo y un enlace para saltar al contenido', () => {
    como({ estado: 'visitante' });
    expect(screen.getByText('Contenido de la página')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ciudad Viva' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido');
  });

  it('visitante: lo público, Reportar y la entrada; sin menú de cuenta', () => {
    como({ estado: 'visitante' });
    const barra = barraInferior();
    expect(within(barra).getByRole('link', { name: 'Mapa' })).toHaveAttribute('aria-current', 'page');
    expect(within(barra).getByRole('link', { name: 'Reportar' })).toHaveAttribute('href', '/reportar');
    expect(within(barra).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
    expect(screen.queryByRole('button', { name: /cuenta/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });

  it('ciudadano: cinco ítems en el móvil, con «Cuenta» al final', () => {
    como({ estado: 'identificado', usuario: ANA }, '/mis-reportes/3');
    const barra = barraInferior();
    expect(within(barra).getAllByRole('listitem')).toHaveLength(5);
    expect(within(barra).getByRole('link', { name: 'Mis reportes' })).toHaveAttribute('aria-current', 'page');
    expect(within(barra).getByRole('button', { name: 'Cuenta' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('«Cerrar sesión» vive en el menú de cuenta, con perfil y soporte', async () => {
    como({ estado: 'identificado', usuario: ANA });
    const usuario = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();

    const boton = screen.getByRole('button', { name: 'Menú de cuenta de Ana Vecina' });
    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(boton.getAttribute('aria-controls')!)!;
    expect(within(panel).getByText('Ciudadano')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/perfil');
    expect(within(panel).getByRole('link', { name: 'Soporte' })).toHaveAttribute('href', '/soporte');
    expect(within(panel).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    // US-23: la apariencia también se elige desde el menú.
    expect(within(panel).getByRole('group', { name: 'Apariencia' })).toBeInTheDocument();

    // Escape cierra y devuelve el foco al botón.
    await usuario.keyboard('{Escape}');
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(boton).toHaveFocus();
  });

  it('«Cerrar sesión» cierra el menú y devuelve el foco a «Cuenta»', async () => {
    // Si hay reportes en cola, el diálogo de la pregunta no queda encima de un
    // menú abierto que también atiende Escape, ni el foco en un botón tapado.
    como({ estado: 'identificado', usuario: ANA });
    const usuario = userEvent.setup();
    const boton = within(barraInferior()).getByRole('button', { name: 'Cuenta' });
    await usuario.click(boton);
    const panel = document.getElementById(boton.getAttribute('aria-controls')!)!;
    await usuario.click(within(panel).getByRole('button', { name: 'Cerrar sesión' }));
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(boton.getAttribute('aria-controls')!)).toBeNull();
    expect(boton).toHaveFocus();
  });

  it('el menú se cierra al tocar fuera', async () => {
    como({ estado: 'identificado', usuario: ANA });
    const usuario = userEvent.setup();
    const boton = within(barraInferior()).getByRole('button', { name: 'Cuenta' });
    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    await usuario.click(screen.getByText('Contenido de la página'));
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  it('móvil: el menú cubre la pantalla con su título, deja inerte lo de debajo y «Cerrar» lo cierra', async () => {
    como({ estado: 'identificado', usuario: ANA });
    const usuario = userEvent.setup();
    const contenido = screen.getByText('Contenido de la página');
    const boton = within(barraInferior()).getByRole('button', { name: 'Cuenta' });
    await usuario.click(boton);
    const panel = document.getElementById(boton.getAttribute('aria-controls')!)!;
    expect(within(panel).getByRole('heading', { name: 'Cuenta' })).toBeInTheDocument();
    // La cabecera y el contenido quedan inertes; la barra, no: se puede cambiar de destino.
    expect(contenido.closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Ciudad Viva' }).closest('[inert]')).not.toBeNull();
    expect(barraInferior().closest('[inert]')).toBeNull();

    await usuario.click(within(panel).getByRole('button', { name: 'Cerrar' }));
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(boton).toHaveFocus();
    expect(contenido.closest('[inert]')).toBeNull();
  });

  it('móvil: si la ventana pasa a escritorio con el menú abierto, se cierra y nada queda inerte', async () => {
    // Con el teléfono girado la barra se oculta, y el panel con ella.
    const oyentes = new Set<() => void>();
    const escritorio = {
      matches: false,
      addEventListener: (_: string, oyente: () => void) => oyentes.add(oyente),
      removeEventListener: (_: string, oyente: () => void) => oyentes.delete(oyente),
    };
    const otra = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
    vi.stubGlobal('matchMedia', (consulta: string) => (consulta === '(min-width: 48rem)' ? escritorio : otra));
    try {
      como({ estado: 'identificado', usuario: ANA });
      const boton = within(barraInferior()).getByRole('button', { name: 'Cuenta' });
      await userEvent.setup().click(boton);
      expect(screen.getByText('Contenido de la página').closest('[inert]')).not.toBeNull();

      escritorio.matches = true;
      act(() => oyentes.forEach((oyente) => oyente()));
      expect(boton).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByText('Contenido de la página').closest('[inert]')).toBeNull();
      expect(oyentes.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('escritorio: el menú de la cabecera no deja inerte la página', async () => {
    como({ estado: 'identificado', usuario: ANA });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Menú de cuenta de Ana Vecina' }));
    expect(screen.getByText('Contenido de la página').closest('[inert]')).toBeNull();
  });

  it('funcionario: su navegación y la insignia de su municipalidad', () => {
    como({
      estado: 'identificado',
      usuario: { ...ANA, rol: 'FUNCIONARIO_MUNICIPAL', distritoNombre: 'Miraflores' } as Usuario,
    }, '/bandeja');
    expect(screen.getByText('Municipalidad de Miraflores')).toBeInTheDocument();
    const barra = barraInferior();
    expect(within(barra).getByRole('link', { name: 'Bandeja' })).toHaveAttribute('aria-current', 'page');
    expect(within(barra).getByRole('link', { name: 'Panel' })).toHaveAttribute('href', '/dashboard');
    expect(within(barra).queryByRole('link', { name: 'Reportar' })).toBeNull();
  });

  it('sin red y con sesión: lo público y el menú de cuenta para poder salir', async () => {
    como({ estado: 'sin-identificar' });
    const barra = barraInferior();
    expect(within(barra).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/mapa', '/desempeno']);
    await userEvent.setup().click(within(barra).getByRole('button', { name: 'Cuenta' }));
    expect(screen.getByText('No se pudo cargar tu cuenta: revisa tu conexión.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('mientras averigua quién mira, la barra reserva su lugar sin ítems', () => {
    como({ estado: 'cargando' });
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ciudad Viva' })).toBeInTheDocument();
  });

  it('las pantallas de acceso no llevan el marco', () => {
    como({ estado: 'visitante' }, '/login');
    expect(screen.getByText('Contenido de la página')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ciudad Viva' })).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('la aceptación de términos lleva solo el logo', () => {
    como({ estado: 'identificado', usuario: ANA }, '/aceptar-terminos');
    expect(screen.getByRole('link', { name: 'Ciudad Viva' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
