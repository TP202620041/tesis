import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PASOS } from '../model/pasos';
import { GuiaInteractiva } from './GuiaInteractiva';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const tituloDelPaso = () => screen.getByRole('heading', { level: 2 });

describe('GuiaInteractiva (US-24 Esc. 1)', () => {
  it('empieza en el primer paso, con su ilustración descrita y la opción de saltarla', () => {
    render(<GuiaInteractiva />);
    expect(screen.getByRole('heading', { level: 1, name: '¿Cómo funciona Ciudad Viva?' })).toBeInTheDocument();
    expect(tituloDelPaso()).toHaveTextContent(`Paso 1 de ${PASOS.length}${PASOS[0]!.titulo}`);
    expect(screen.getByRole('img', { name: PASOS[0]!.descripcionIlustracion })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saltar la guía e ir al mapa' })).toHaveAttribute('href', '/mapa');
    expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument();
    // Al cargar, el foco no se mueve.
    expect(tituloDelPaso()).not.toHaveFocus();
  });

  it('avanza y retrocede con los botones y lleva el foco al título del paso', async () => {
    const usuario = userEvent.setup();
    render(<GuiaInteractiva />);

    await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(tituloDelPaso()).toHaveTextContent(`Paso 2 de ${PASOS.length}${PASOS[1]!.titulo}`);
    expect(tituloDelPaso()).toHaveFocus();

    await usuario.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(tituloDelPaso()).toHaveTextContent(PASOS[0]!.titulo);
  });

  it('se puede usar solo con el teclado', async () => {
    const usuario = userEvent.setup();
    render(<GuiaInteractiva />);
    screen.getByRole('button', { name: 'Siguiente' }).focus();
    await usuario.keyboard('{Enter}');
    expect(tituloDelPaso()).toHaveTextContent(PASOS[1]!.titulo);
  });

  it('la lista de pasos marca el actual y deja saltar a cualquiera', async () => {
    const usuario = userEvent.setup();
    render(<GuiaInteractiva />);
    const pasos = screen.getByRole('navigation', { name: 'Pasos de la guía' });
    const reportar = PASOS.find((p) => p.id === 'reportar')!;

    await usuario.click(screen.getByRole('button', { name: new RegExp(reportar.titulo) }));

    expect(tituloDelPaso()).toHaveTextContent(reportar.titulo);
    expect(pasos.querySelector('[aria-current="step"]')).toHaveTextContent(reportar.titulo);
    expect(screen.getByRole('link', { name: reportar.enlace.texto })).toHaveAttribute('href', reportar.enlace.href);
  });

  it('en el último paso ofrece empezar en lugar de «Siguiente»', async () => {
    const usuario = userEvent.setup();
    render(<GuiaInteractiva />);
    const ultimo = PASOS[PASOS.length - 1]!;

    await usuario.click(screen.getByRole('button', { name: new RegExp(ultimo.titulo) }));

    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Empezar' })).toHaveAttribute('href', '/mapa');
  });
});
