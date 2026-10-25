import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
const menuDeAna = () => screen.getByRole('button', { name: 'Menú de cuenta de Ana Vecina' });

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

  it('visitante: lo público, Reportar y la entrada; sin cuenta', () => {
    como({ estado: 'visitante' });
    const barra = barraInferior();
    expect(within(barra).getByRole('link', { name: 'Mapa' })).toHaveAttribute('aria-current', 'page');
    expect(within(barra).getByRole('link', { name: 'Reportar' })).toHaveAttribute('href', '/reportar');
    expect(within(barra).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
    expect(within(barra).queryByRole('link', { name: 'Cuenta' })).toBeNull();
    expect(screen.queryByRole('button', { name: /cuenta/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });

  it('ciudadano: cinco ítems en el móvil, con «Cuenta» al final', () => {
    como({ estado: 'identificado', usuario: ANA }, '/mis-reportes/3');
    const barra = barraInferior();
    expect(within(barra).getAllByRole('listitem')).toHaveLength(5);
    expect(within(barra).getByRole('link', { name: 'Mis reportes' })).toHaveAttribute('aria-current', 'page');
    expect(within(barra).getAllByRole('link').at(-1)).toHaveAccessibleName('Cuenta');
  });

  it('móvil: «Cuenta» es una pantalla (Mi perfil), no un menú encima; sigue marcada en Soporte', () => {
    // Prueba en iPhone del 23/10: tiene que seguir las reglas de las demás pantallas.
    const { unmount } = como({ estado: 'identificado', usuario: ANA }, '/perfil');
    const cuenta = within(barraInferior()).getByRole('link', { name: 'Cuenta' });
    expect(cuenta).toHaveAttribute('href', '/perfil');
    expect(cuenta).toHaveAttribute('aria-current', 'page');
    expect(within(barraInferior()).queryByRole('button')).toBeNull();
    unmount();

    como({ estado: 'identificado', usuario: ANA }, '/soporte');
    expect(within(barraInferior()).getByRole('link', { name: 'Cuenta' })).toHaveAttribute('aria-current', 'page');
  });

  it('escritorio: «Cerrar sesión» vive en el menú de cuenta, con perfil y soporte', async () => {
    como({ estado: 'identificado', usuario: ANA });
    const usuario = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();

    const boton = menuDeAna();
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

  it('escritorio: «Cerrar sesión» cierra el menú y devuelve el foco a su botón', async () => {
    // Si hay reportes en cola, el diálogo de la pregunta no queda encima de un
    // menú abierto que también atiende Escape, ni el foco en un botón tapado.
    como({ estado: 'identificado', usuario: ANA });
    const usuario = userEvent.setup();
    const boton = menuDeAna();
    await usuario.click(boton);
    const panel = document.getElementById(boton.getAttribute('aria-controls')!)!;
    await usuario.click(within(panel).getByRole('button', { name: 'Cerrar sesión' }));
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(boton.getAttribute('aria-controls')!)).toBeNull();
    expect(boton).toHaveFocus();
  });

  it('escritorio: el menú se cierra al tocar fuera', async () => {
    como({ estado: 'identificado', usuario: ANA });
    const usuario = userEvent.setup();
    const boton = menuDeAna();
    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    await usuario.click(screen.getByText('Contenido de la página'));
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  it('móvil: el título pasa a la barra siguiendo el desplazamiento, y sigue sus cambios', async () => {
    // Cada cuadro se mide en el acto; jsdom no mide cajas: se las dicta el test.
    vi.stubGlobal('requestAnimationFrame', (medir: FrameRequestCallback) => {
      medir(0);
      return 1;
    });
    try {
      ruta.actual = '/mis-reportes';
      vi.mocked(useUsuarioDelMarco).mockReturnValue({ estado: 'identificado', usuario: ANA });
      const { rerender } = render(
        <MarcoDeLaApp>
          <h1>Mis reportes</h1>
        </MarcoDeLaApp>,
      );
      const barra = screen.getByRole('banner');
      const h1 = screen.getByRole('heading', { level: 1, name: 'Mis reportes' });
      vi.spyOn(barra, 'getBoundingClientRect').mockReturnValue({ bottom: 110 } as DOMRect);
      let arribaDelH1 = 150;
      vi.spyOn(h1, 'getBoundingClientRect').mockImplementation(() => ({ top: arribaDelH1, height: 32 }) as DOMRect);
      /** El <h1> queda con su borde superior en `arriba` (px desde el borde de la pantalla). */
      const desplazar = (arriba: number) => {
        arribaDelH1 = arriba;
        act(() => {
          window.dispatchEvent(new Event('scroll'));
        });
      };
      const avance = () => Number(barra.style.getPropertyValue('--cv-avance-titulo'));
      const compacto = () => barra.querySelector('[data-titulo-compacto]')!;

      // En la página, por debajo de la barra: nada cambia, pero el texto ya está listo.
      desplazar(150);
      expect(avance()).toBe(0);
      expect(compacto()).toHaveTextContent('Mis reportes');
      expect(compacto()).toHaveAttribute('aria-hidden', 'true');
      expect(barra).toHaveAttribute('data-compacto', 'false');
      // Mientras pasa bajo la barra, el cambio queda a medias y crece con el
      // dedo, sin saltos de 0 a 1 (los valores exactos dependen del ajuste).
      const intermedios = [90, 75, 60].map((arriba) => {
        desplazar(arriba);
        return avance();
      });
      expect(intermedios.every((valor) => valor > 0 && valor < 1)).toBe(true);
      expect(intermedios).toEqual([...intermedios].sort((a, b) => a - b));
      expect(new Set(intermedios).size).toBe(intermedios.length);
      expect(barra).toHaveAttribute('data-compacto', 'false');
      // Ya por encima: el título está en la barra y el logo sale del foco.
      desplazar(-20);
      expect(avance()).toBe(1);
      expect(barra).toHaveAttribute('data-compacto', 'true');
      // De vuelta arriba, se deshace.
      desplazar(150);
      expect(avance()).toBe(0);

      // El detalle que termina de cargar cambia el texto del mismo <h1>.
      rerender(
        <MarcoDeLaApp>
          <h1>Bache en Av. Larco</h1>
        </MarcoDeLaApp>,
      );
      await waitFor(() => expect(compacto()).toHaveTextContent('Bache en Av. Larco'));
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('sin <h1> en la pantalla, la barra no muestra título compacto', () => {
    como({ estado: 'identificado', usuario: ANA });
    const barra = screen.getByRole('banner');
    expect(barra.querySelector('[data-titulo-compacto]')).toBeEmptyDOMElement();
    expect(Number(barra.style.getPropertyValue('--cv-avance-titulo'))).toBe(0);
  });

  it('funcionario: su navegación, la insignia de su municipalidad y «Cuenta»', () => {
    como({
      estado: 'identificado',
      usuario: { ...ANA, rol: 'FUNCIONARIO_MUNICIPAL', distritoNombre: 'Miraflores' } as Usuario,
    }, '/bandeja');
    expect(screen.getByText('Municipalidad de Miraflores')).toBeInTheDocument();
    const barra = barraInferior();
    expect(within(barra).getByRole('link', { name: 'Bandeja' })).toHaveAttribute('aria-current', 'page');
    expect(within(barra).getByRole('link', { name: 'Panel' })).toHaveAttribute('href', '/dashboard');
    expect(within(barra).queryByRole('link', { name: 'Reportar' })).toBeNull();
    expect(within(barra).getByRole('link', { name: 'Cuenta' })).toHaveAttribute('href', '/perfil');
  });

  it('sin red y con sesión: lo público, «Cuenta» y, en escritorio, el menú para poder salir', async () => {
    como({ estado: 'sin-identificar' });
    const barra = barraInferior();
    expect(within(barra).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/mapa',
      '/desempeno',
      '/perfil',
    ]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Menú de cuenta de Tu cuenta' }));
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
