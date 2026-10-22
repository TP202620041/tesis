import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

    // Escape cierra y devuelve el foco al botón.
    await usuario.keyboard('{Escape}');
    expect(boton).toHaveAttribute('aria-expanded', 'false');
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
