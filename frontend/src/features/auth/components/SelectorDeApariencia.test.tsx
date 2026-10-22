import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLAVE_APARIENCIA } from '../model/apariencia';
import { useTemaDeLaApp } from '../hooks/useApariencia';
import { SelectorDeApariencia } from './SelectorDeApariencia';

function sistema({ oscuro = false, masContraste = false } = {}) {
  const oyentes = new Set<() => void>();
  const estado = { oscuro, masContraste };
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    get matches() {
      return (
        (consulta === '(prefers-color-scheme: dark)' && estado.oscuro) ||
        (consulta === '(prefers-contrast: more)' && estado.masContraste)
      );
    },
    addEventListener: (_: string, f: () => void) => oyentes.add(f),
    removeEventListener: (_: string, f: () => void) => oyentes.delete(f),
  }));
  return {
    pasarAOscuro() {
      estado.oscuro = true;
      for (const f of oyentes) f();
    },
  };
}

const tema = () => document.documentElement.getAttribute('data-theme');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('SelectorDeApariencia (US-23)', () => {
  it('es un grupo de radios «Apariencia» con las cuatro opciones', () => {
    sistema();
    render(<SelectorDeApariencia />);
    const grupo = screen.getByRole('group', { name: 'Apariencia' });
    expect(grupo).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    // Sin nada guardado, sigue al sistema.
    expect(screen.getByRole('radio', { name: /^Sistema/ })).toBeChecked();
  });

  it('elegir aplica el tema en el acto y lo guarda en el dispositivo', async () => {
    sistema();
    render(<SelectorDeApariencia />);
    await userEvent.setup().click(screen.getByRole('radio', { name: /^Oscuro/ }));
    expect(tema()).toBe('oscuro');
    expect(window.localStorage.getItem(CLAVE_APARIENCIA)).toBe('oscuro');
    expect(screen.getByRole('radio', { name: /^Oscuro/ })).toBeChecked();
  });

  it('dos selectores en la página (cabecera y barra) no se pisan y se sincronizan', async () => {
    sistema();
    render(
      <>
        <SelectorDeApariencia variante="menu" />
        <SelectorDeApariencia variante="menu" />
      </>,
    );
    const [, segundoAlto] = screen.getAllByRole('radio', { name: /Alto contraste/ });
    await userEvent.setup().click(segundoAlto!);
    for (const radio of screen.getAllByRole('radio', { name: /Alto contraste/ })) expect(radio).toBeChecked();
    expect(tema()).toBe('alto-contraste');
  });

  it('sin localStorage la elección vale igual (en memoria)', async () => {
    sistema();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    render(<SelectorDeApariencia />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('radio', { name: /^Claro/ }));
    expect(tema()).toBe('claro');
    expect(screen.getByRole('radio', { name: /^Claro/ })).toBeChecked();

    // Vuelve el almacenamiento: la siguiente elección ya se guarda (y deja
    // de valer la de memoria, que si no pisaría lo guardado en otros tests).
    vi.restoreAllMocks();
    await usuario.click(screen.getByRole('radio', { name: /^Sistema/ }));
    expect(window.localStorage.getItem(CLAVE_APARIENCIA)).toBe('sistema');
  });
});

describe('useTemaDeLaApp', () => {
  it('aplica lo guardado al montar (el doble montaje de desarrollo borra data-theme)', () => {
    sistema();
    window.localStorage.setItem(CLAVE_APARIENCIA, 'alto-contraste');
    renderHook(() => useTemaDeLaApp());
    expect(tema()).toBe('alto-contraste');
  });

  it('con «Sistema», sigue los cambios del dispositivo', () => {
    const dispositivo = sistema();
    renderHook(() => useTemaDeLaApp());
    expect(tema()).toBe('claro');
    act(() => dispositivo.pasarAOscuro());
    expect(tema()).toBe('oscuro');
  });

  it('una elección en otra pestaña llega por el evento storage', () => {
    sistema();
    renderHook(() => useTemaDeLaApp());
    act(() => {
      window.localStorage.setItem(CLAVE_APARIENCIA, 'oscuro');
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_APARIENCIA }));
    });
    expect(tema()).toBe('oscuro');
  });
});
