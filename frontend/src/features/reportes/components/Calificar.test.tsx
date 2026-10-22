import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useCalificar } from '../hooks/useCalificar';
import type { Calificacion } from '../model/tipos';
import { Calificar } from './Calificar';

vi.mock('../hooks/useCalificar', () => ({ useCalificar: vi.fn() }));

function conCalificacion(existente: Calificacion | null) {
  vi.mocked(useCalificar).mockReturnValue({
    cargando: false,
    existente,
    enviar: vi.fn(),
    enviando: false,
    error: null,
  });
}

afterEach(() => {
  vi.mocked(useCalificar).mockReset();
});

describe('Calificar (US-26)', () => {
  it('QA-1 M-13: invita a calificar mientras no se calificó', () => {
    conCalificacion(null);
    render(<Calificar reporteId={7} />);
    expect(screen.getByText(/Puedes calificar la atención recibida/)).toBeInTheDocument();
  });

  it('QA-1 M-13: tras calificar ya no invita; muestra lo calificado', () => {
    conCalificacion({ estrellas: 4, comentario: 'Bien', createdAt: '2026-10-21T15:00:00Z' } as Calificacion);
    render(<Calificar reporteId={7} />);
    expect(screen.queryByText(/Puedes calificar/)).not.toBeInTheDocument();
    expect(screen.getByText(/Ya calificaste este reporte/)).toBeInTheDocument();
  });
});
