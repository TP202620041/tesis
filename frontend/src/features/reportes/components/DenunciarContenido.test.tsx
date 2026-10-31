import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/errors';
import { denunciarReporte, misReportes } from '../api';
import type { ReporteResumen } from '../model/tipos';
import { DenunciarContenido } from './DenunciarContenido';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('../api', () => ({ denunciarReporte: vi.fn(), misReportes: vi.fn() }));

// jsdom no implementa `showModal`/`close` de <dialog>: lo minimo del navegador.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  vi.mocked(denunciarReporte).mockReset();
  vi.mocked(misReportes).mockReset();
});

const AJENOS: ReporteResumen[] = [{ id: 1 }, { id: 2 }] as ReporteResumen[];

async function abrirDialogo() {
  const boton = await screen.findByRole('button', { name: 'Denunciar contenido' });
  await userEvent.click(boton);
  return screen.getByRole('dialog', { name: 'Denunciar este reporte' });
}

describe('DenunciarContenido (NC-11b)', () => {
  it('sin sesión ofrece el enlace al login que vuelve al reporte', () => {
    render(<DenunciarContenido reporteId={42} puedeDenunciar={false} sinSesion />);
    expect(screen.getByRole('link', { name: 'Inicia sesión para denunciar contenido' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Freportes%2F42',
    );
    expect(misReportes).not.toHaveBeenCalled();
  });

  it('otro rol con sesión (funcionario, ADMIN) no ve nada', async () => {
    const { container } = render(<DenunciarContenido reporteId={42} puedeDenunciar={false} sinSesion={false} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(misReportes).not.toHaveBeenCalled();
  });

  it('no aparece en el reporte propio', async () => {
    vi.mocked(misReportes).mockResolvedValue([{ id: 42 }] as ReporteResumen[]);
    const { container } = render(<DenunciarContenido reporteId={42} puedeDenunciar sinSesion={false} />);
    await waitFor(() => expect(misReportes).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('button', { name: 'Denunciar contenido' })).not.toBeInTheDocument();
  });

  it('éxito: elige el motivo, envía y agradece; el botón no vuelve', async () => {
    vi.mocked(misReportes).mockResolvedValue(AJENOS);
    vi.mocked(denunciarReporte).mockResolvedValue({
      id: 7,
      reporteId: 42,
      motivo: 'DATOS_PERSONALES',
      createdAt: '2026-10-29T14:50:00Z',
    });
    render(<DenunciarContenido reporteId={42} puedeDenunciar sinSesion={false} />);
    const dialogo = await abrirDialogo();

    // El aviso del dialogo: quien lo envio no sabra quien denuncio.
    expect(dialogo).toHaveTextContent('quien lo envió no sabrá quién lo denunció');
    const enviar = screen.getByRole('button', { name: 'Enviar denuncia' });
    expect(enviar).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: 'Muestra datos personales' }));
    await userEvent.type(screen.getByLabelText(/Detalle/), 'Se ve la placa de un auto');
    await userEvent.click(enviar);

    expect(denunciarReporte).toHaveBeenCalledWith(42, {
      motivo: 'DATOS_PERSONALES',
      detalle: 'Se ve la placa de un auto',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Gracias. Recibimos tu denuncia y la revisaremos.');
    expect(screen.queryByRole('button', { name: 'Denunciar contenido' })).not.toBeInTheDocument();
  });

  it.each([
    ['DENUNCIA_REPETIDA', 'Ya denunciaste este reporte', false],
    ['LIMITE_DENUNCIAS', 'Alcanzaste el máximo de denuncias por hoy', true],
    ['DENUNCIA_PROPIA', 'No puedes denunciar tu propio reporte', false],
  ])('409 %s: muestra «%s» (puede reintentar: %s)', async (codigo, mensaje, reintenta) => {
    vi.mocked(misReportes).mockResolvedValue(AJENOS);
    vi.mocked(denunciarReporte).mockRejectedValue(new ApiError(409, 'otro texto', '', [], codigo));
    render(<DenunciarContenido reporteId={42} puedeDenunciar sinSesion={false} />);
    await abrirDialogo();

    await userEvent.click(screen.getByRole('radio', { name: 'Otro motivo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar denuncia' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje);
    // El dialogo sigue abierto para que lea el mensaje.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    if (reintenta) {
      expect(screen.getByRole('button', { name: 'Enviar denuncia' })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: 'Enviar denuncia' })).not.toBeInTheDocument();
    }

    // Al cerrar: un 409 definitivo se queda en lugar del boton (repetiria el
    // mismo 409); el limite diario deja volver a intentar.
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    if (reintenta) {
      expect(screen.getByRole('button', { name: 'Denunciar contenido' })).toBeInTheDocument();
      expect(screen.queryByText(mensaje)).not.toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: 'Denunciar contenido' })).not.toBeInTheDocument();
      expect(screen.getByText(mensaje)).toBeInTheDocument();
    }
  });

  it('no envía sin motivo (el botón está deshabilitado)', async () => {
    vi.mocked(misReportes).mockResolvedValue(AJENOS);
    render(<DenunciarContenido reporteId={42} puedeDenunciar sinSesion={false} />);
    await abrirDialogo();
    expect(screen.getByRole('button', { name: 'Enviar denuncia' })).toBeDisabled();
    expect(denunciarReporte).not.toHaveBeenCalled();
  });
});
