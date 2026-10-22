import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { claveDelCierre } from '../hooks/useCierreDelAvisoDeIncompletos';
import {
  AvisoPendientesSinSesion,
  AvisoReportesIncompletos,
  DialogoCierreConPendientes,
  textoDelCierre,
} from './AvisosDeLaCola';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe('AvisoPendientesSinSesion', () => {
  it('avisa sin bloquear y enlaza al login con la ruta actual de vuelta', () => {
    render(<AvisoPendientesSinSesion cantidad={2} ruta="/mapa" />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Tienes 2 reportes pendientes de envío: inicia sesión para enviarlos.',
    );
    expect(screen.getByRole('link', { name: 'inicia sesión para enviarlos' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fmapa',
    );
  });

  it('no aparece en el login ni sin pendientes', () => {
    const { container, rerender } = render(<AvisoPendientesSinSesion cantidad={1} ruta="/login" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<AvisoPendientesSinSesion cantidad={0} ruta="/mapa" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AvisoReportesIncompletos (NC-02)', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('avisa sin bloquear y enlaza a «Pendiente de envío» en Mis reportes', () => {
    render(<AvisoReportesIncompletos cantidad={2} ruta="/mapa" usuarioId={7} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Tienes 2 reportes sin enviar a los que les faltan datos: complétalos en Mis reportes.',
    );
    expect(screen.getByRole('link', { name: 'complétalos en Mis reportes' })).toHaveAttribute(
      'href',
      '/mis-reportes#pendientes-de-envio',
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('se cierra por la sesion de la pestaña y vuelve si aparecen mas incompletos', async () => {
    const usuario = userEvent.setup();
    const { container, unmount } = render(<AvisoReportesIncompletos cantidad={1} ruta="/mapa" usuarioId={7} />);

    await usuario.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(container).toBeEmptyDOMElement();
    expect(sessionStorage.getItem(claveDelCierre(7))).toBe('1');
    unmount();

    // Otra pantalla, misma pestaña: sigue cerrado.
    const otra = render(<AvisoReportesIncompletos cantidad={1} ruta="/desempeno" usuarioId={7} />);
    expect(otra.container).toBeEmptyDOMElement();

    // Aparece otro incompleto: es informacion nueva, el aviso vuelve.
    otra.rerender(<AvisoReportesIncompletos cantidad={2} ruta="/desempeno" usuarioId={7} />);
    expect(screen.getByRole('status')).toHaveTextContent('Tienes 2 reportes sin enviar');
  });

  it('si bajan los incompletos, el umbral baja: uno nuevo vuelve a avisar', async () => {
    const usuario = userEvent.setup();
    const { container, rerender } = render(
      <AvisoReportesIncompletos cantidad={2} ruta="/mapa" usuarioId={7} />,
    );
    await usuario.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(container).toBeEmptyDOMElement();

    // Completo uno: queda 1, sigue cerrado y el umbral baja a 1.
    rerender(<AvisoReportesIncompletos cantidad={1} ruta="/mapa" usuarioId={7} />);
    expect(container).toBeEmptyDOMElement();
    expect(sessionStorage.getItem(claveDelCierre(7))).toBe('1');

    // Aparece otro incompleto (vuelven a ser 2): es nuevo, el aviso vuelve.
    rerender(<AvisoReportesIncompletos cantidad={2} ruta="/mapa" usuarioId={7} />);
    expect(screen.getByRole('status')).toHaveTextContent('Tienes 2 reportes sin enviar');
  });

  it('el cierre es por usuario: en la misma pestaña, otro usuario si ve su aviso', async () => {
    const usuario = userEvent.setup();
    const { container, rerender } = render(
      <AvisoReportesIncompletos cantidad={2} ruta="/mapa" usuarioId={7} />,
    );
    await usuario.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(container).toBeEmptyDOMElement();

    rerender(<AvisoReportesIncompletos cantidad={1} ruta="/mapa" usuarioId={8} />);
    expect(screen.getByRole('status')).toHaveTextContent('Tienes 1 reporte sin enviar');
  });

  it('sin sessionStorage se cierra igual (en memoria)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const usuario = userEvent.setup();
    const { container } = render(<AvisoReportesIncompletos cantidad={1} ruta="/mapa" usuarioId={7} />);

    await usuario.click(screen.getByRole('button', { name: 'Cerrar aviso' }));

    expect(container).toBeEmptyDOMElement();
  });

  it('no aparece sin incompletos ni en Mis reportes, donde ya esta la lista', () => {
    const { container, rerender } = render(<AvisoReportesIncompletos cantidad={0} ruta="/mapa" usuarioId={7} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<AvisoReportesIncompletos cantidad={1} ruta="/mis-reportes" usuarioId={7} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('dialogo de cierre con pendientes (NC-02: no promete enviar lo que no se envia)', () => {
  it('textoDelCierre separa los que se enviaran solos de los que necesitan accion', () => {
    expect(textoDelCierre(2, 0)).toBe(
      '2 se enviarán cuando vuelvas a entrar. Si este dispositivo no es tuyo, puedes descartarlos.',
    );
    expect(textoDelCierre(0, 1)).toBe(
      '1 no se enviará solo: necesita que lo completes, lo revises o lo descartes en Mis reportes. ' +
        'Si este dispositivo no es tuyo, puedes descartarlos.',
    );
    expect(textoDelCierre(1, 2)).toMatch(
      /^1 se enviará cuando vuelvas a entrar\. 2 no se enviarán solos: necesitan/,
    );
  });

  it('con solo incompletos el dialogo no dice «se enviarán»', () => {
    render(
      <DialogoCierreConPendientes
        cantidad={1}
        seEnviaran={0}
        requierenAccion={1}
        onConservar={vi.fn()}
        onDescartar={vi.fn()}
      />,
    );
    const dialogo = screen.getByRole('alertdialog');
    expect(dialogo).toHaveTextContent('Tienes 1 reporte sin enviar en este dispositivo.');
    expect(dialogo).not.toHaveTextContent(/se enviarán/);
    expect(dialogo).toHaveTextContent('1 no se enviará solo');
  });

  it('DIS-1: al abrirse lleva el foco a «Conservar», la opción que no pierde nada', () => {
    render(
      <DialogoCierreConPendientes cantidad={2} onConservar={vi.fn()} onDescartar={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Conservar' })).toHaveFocus();
  });
});
