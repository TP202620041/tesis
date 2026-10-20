import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextoTerminosYPrivacidad } from './TextoTerminosYPrivacidad';
import { VERSION_TERMINOS } from '@/features/auth/model/terminos';

describe('TextoTerminosYPrivacidad', () => {
  it('avisa de forma visible que es un borrador y muestra la versión', () => {
    render(<TextoTerminosYPrivacidad />);
    expect(screen.getByRole('note')).toHaveTextContent('Borrador pendiente de revisión');
    expect(screen.getAllByText(VERSION_TERMINOS).length).toBeGreaterThanOrEqual(2);
  });

  it('trae las diez secciones del borrador, en orden', () => {
    render(<TextoTerminosYPrivacidad />);
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos).toHaveLength(10);
    expect(titulos[0]).toBe('1. Quiénes somos');
    expect(titulos[4]).toBe('5. Tus consentimientos (y cómo retirarlos)');
    expect(titulos[9]).toBe('10. Cambios a este documento');
  });

  it('deja visibles los [COMPLETAR] del borrador en vez de inventar datos', () => {
    render(<TextoTerminosYPrivacidad />);
    expect(screen.getByText('[COMPLETAR: nombres de los autores]')).toBeInTheDocument();
  });

  it('sin título, para incrustarlo en la pantalla de aceptación', () => {
    render(<TextoTerminosYPrivacidad conTitulo={false} />);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
