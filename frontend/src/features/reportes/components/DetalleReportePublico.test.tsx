import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useReportePublico } from '../hooks/useReportePublico';
import { DetalleReportePublico } from './DetalleReportePublico';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('../hooks/useReportePublico', () => ({ useReportePublico: vi.fn() }));
vi.mock('./Comentarios', () => ({ Comentarios: () => null }));
vi.mock('@/components/UbicacionDelReporte', () => ({ UbicacionDelReporte: () => null }));

afterEach(() => {
  vi.mocked(useReportePublico).mockReset();
});

function conReporte(datos: object | null) {
  vi.mocked(useReportePublico).mockReturnValue({
    estado: 'listo',
    datos,
    error: null,
    recargar: vi.fn(),
    recargando: false,
  } as unknown as ReturnType<typeof useReportePublico>);
}

describe('DetalleReportePublico', () => {
  it('QA-1 M-11: con un id inválido dice «Reporte no disponible» sin consultar el API', () => {
    render(<DetalleReportePublico reporteId={null} puedeComentar={false} />);

    expect(screen.getByRole('heading', { name: 'Reporte no disponible' })).toBeInTheDocument();
    expect(useReportePublico).not.toHaveBeenCalled();
  });

  it('QA-1 M-9: «Volver al mapa» regresa a la vista filtrada de la que se vino', () => {
    conReporte({ id: 7, titulo: 'Bache en Av. Larco', estado: 'PENDIENTE', distritoNombre: 'Miraflores' });
    render(<DetalleReportePublico reporteId={7} puedeComentar={false} volver="/mapa?distrito=21&vista=lista" />);

    expect(screen.getByRole('link', { name: '← Volver al mapa' })).toHaveAttribute(
      'href',
      '/mapa?distrito=21&vista=lista',
    );
  });

  it('QA-1 M-9: un ?volver= que no es el mapa se ignora', () => {
    conReporte(null);
    render(<DetalleReportePublico reporteId={7} puedeComentar={false} volver="https://otro.example/mapa" />);

    expect(screen.getByRole('link', { name: 'Ver el mapa' })).toHaveAttribute('href', '/mapa');
  });
});
