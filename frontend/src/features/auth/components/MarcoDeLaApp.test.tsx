import { useEffect, useRef, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Usuario } from '@/lib/types/domain';
import { useUsuarioDelMarco, type UsuarioDelMarco } from '../hooks/useUsuarioDelMarco';
import { MarcoDeLaApp } from './MarcoDeLaApp';

const { ruta, cierre } = vi.hoisted(() => ({
  ruta: { actual: '/mapa' },
  // Lo que además dispara el toque en «Cerrar sesión» (la pregunta de la cola).
  cierre: { alPulsar: null as null | (() => void) },
}));
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
    <button
      type="button"
      onClick={() => {
        alActivar?.();
        cierre.alPulsar?.();
      }}
    >
      Cerrar sesión
    </button>
  ),
}));

/**
 * Como `DialogoCierreConPendientes`: el mismo toque en «Cerrar sesión» la
 * monta (está en el contenido de la página) y, al montarse, toma el foco.
 */
function PreguntaDelCierre({ alMontar }: { alMontar: (inerte: boolean) => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    cierre.alPulsar = () => setVisible(true);
    return () => {
      cierre.alPulsar = null;
    };
  }, []);
  return visible ? <Conservar alMontar={alMontar} /> : null;
}

function Conservar({ alMontar }: { alMontar: (inerte: boolean) => void }) {
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    alMontar(boton.current!.closest('[inert]') !== null);
    boton.current!.focus();
  }, [alMontar]);
  return (
    <button ref={boton} type="button">
      Conservar
    </button>
  );
}

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

  it('el menú se cierra al tocar fuera de él', async () => {
    como({ estado: 'identificado', usuario: ANA });
    const usuario = userEvent.setup();
    // Escritorio: la página sigue a la vista y se puede tocar.
    const desplegable = screen.getByRole('button', { name: 'Menú de cuenta de Ana Vecina' });
    await usuario.click(desplegable);
    expect(desplegable).toHaveAttribute('aria-expanded', 'true');
    await usuario.click(screen.getByText('Contenido de la página'));
    expect(desplegable).toHaveAttribute('aria-expanded', 'false');
    // Móvil: el panel tapa la página; lo que queda a mano es la barra.
    const boton = within(barraInferior()).getByRole('button', { name: 'Cuenta' });
    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    await usuario.click(barraInferior());
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  it('móvil: lo que abre «Cerrar sesión» (la pregunta de la cola) nace sin inert y toma el foco', async () => {
    // Si la página se destapara recién en la limpieza del efecto, la pregunta
    // se montaría inerte y su foco no llegaría (el de la prueba en iPhone).
    const alMontar = vi.fn();
    ruta.actual = '/mapa';
    vi.mocked(useUsuarioDelMarco).mockReturnValue({ estado: 'identificado', usuario: ANA });
    render(
      <MarcoDeLaApp>
        <PreguntaDelCierre alMontar={alMontar} />
      </MarcoDeLaApp>,
    );
    const usuario = userEvent.setup();
    const boton = within(barraInferior()).getByRole('button', { name: 'Cuenta' });
    await usuario.click(boton);
    const panel = document.getElementById(boton.getAttribute('aria-controls')!)!;
    await usuario.click(within(panel).getByRole('button', { name: 'Cerrar sesión' }));
    expect(alMontar).toHaveBeenCalledTimes(1);
    expect(alMontar).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Conservar' })).toHaveFocus();
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
