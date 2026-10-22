import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { ESTADOS_REPORTE } from '@/lib/types/domain';
import { Aviso } from './Aviso';
import { clasesDeBoton, EnlaceBoton } from './Boton';
import { ChipEstado } from './ChipEstado';
import { EstadoVacio } from './EstadoVacio';
import { IndicadorSeveridad } from './IndicadorSeveridad';
import { Tarjeta } from './Tarjeta';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('ChipEstado (DIS-1)', () => {
  it.each(ESTADOS_REPORTE)('%s lleva nombre e icono decorativo', (estado) => {
    const { container } = render(<ChipEstado estado={estado} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(container.textContent?.length).toBeGreaterThan(0);
  });

  it('Recibido usa sus tokens (azul), no los de otro estado', () => {
    render(<ChipEstado estado="RECIBIDO" />);
    const chip = screen.getByText('Recibido');
    expect(chip).toHaveClass('bg-recibido-fondo', 'text-recibido-texto');
  });

  it('solo indica: no es enlace ni botón', () => {
    render(<ChipEstado estado="RESUELTO" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('un estado desconocido no rompe', () => {
    render(<ChipEstado estado="ALGO_NUEVO" />);
    expect(screen.getByText('Desconocido')).toBeInTheDocument();
  });
});

describe('IndicadorSeveridad (DIS-1)', () => {
  it('dibuja tantas barras llenas como el nivel y siempre dice el texto', () => {
    const { container } = render(<IndicadorSeveridad severidad="MEDIA" />);
    expect(screen.getByText('Severidad media')).toBeInTheDocument();
    const barras = container.querySelectorAll('[data-llena]');
    expect(barras).toHaveLength(3);
    expect(container.querySelectorAll('[data-llena="si"]')).toHaveLength(2);
    // Las barras son decorativas: el texto ya lo dice.
    expect(barras[0]?.parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('en tinta, nunca en rojo', () => {
    const { container } = render(<IndicadorSeveridad severidad="ALTA" />);
    for (const barra of container.querySelectorAll('[data-llena="si"]')) {
      expect(barra).toHaveClass('bg-severidad');
    }
  });

  it('sin severidad no inventa un nivel', () => {
    const { container } = render(<IndicadorSeveridad severidad={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Aviso', () => {
  it('sin rol es texto fijo; con rol se anuncia', () => {
    const { rerender } = render(<Aviso tono="advertencia">Sin conexión con el servidor</Aviso>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    rerender(
      <Aviso tono="error" rol="alert" titulo="No se pudo enviar">
        Revisa tu conexión
      </Aviso>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo enviarRevisa tu conexión');
  });
});

describe('EstadoVacio', () => {
  it('dice qué pasa y ofrece la salida', () => {
    render(
      <EstadoVacio
        icono={Inbox}
        titulo="Todavía no has enviado ningún reporte."
        accion={<EnlaceBoton href="/reportar">Reportar un daño</EnlaceBoton>}
      />,
    );
    expect(screen.getByText('Todavía no has enviado ningún reporte.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reportar un daño' })).toHaveAttribute('href', '/reportar');
  });
});

describe('Botones', () => {
  it('miden 44 px de alto; el compacto, solo con ratón baja a 36', () => {
    expect(clasesDeBoton('primario')).toContain('min-h-objetivo');
    expect(clasesDeBoton('secundario', 'compacto')).toContain('min-h-9');
    expect(clasesDeBoton('secundario', 'compacto')).toContain('pointer-coarse:min-h-objetivo');
  });

  it('el primario va en tinta (primario), sin celeste', () => {
    expect(clasesDeBoton('primario')).toContain('bg-primario');
    expect(clasesDeBoton('primario')).not.toMatch(/sky-/);
  });
});

describe('Tarjeta', () => {
  it('renderiza el elemento pedido', () => {
    render(
      <ul>
        <Tarjeta como="li">Reporte</Tarjeta>
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Reporte');
  });
});
