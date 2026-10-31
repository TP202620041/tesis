import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResultadoDeAccion } from '../hooks/useDetalleModeracion';
import { AVISO_MOTIVO } from '../model/moderacion';
import { DialogoModerar } from './DialogoModerar';

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

const MOTIVO = 'La foto muestra la placa de un vehículo particular';

function montar(
  accion: 'ocultar' | 'restablecer',
  alcance: 'REPORTE' | 'FOTO',
  resultado: ResultadoDeAccion = { ok: true },
) {
  const onConfirmar = vi.fn().mockResolvedValue(resultado);
  const alCerrar = vi.fn();
  render(<DialogoModerar accion={accion} alcance={alcance} abierto alCerrar={alCerrar} onConfirmar={onConfirmar} />);
  return { onConfirmar, alCerrar };
}

describe('DialogoModerar (NC-11b)', () => {
  it.each([
    ['ocultar', 'REPORTE', 'Ocultar el reporte', /dejará de contar en el índice de desempeño/],
    ['ocultar', 'FOTO', 'Ocultar la foto', /el índice de desempeño no cambia/],
    ['restablecer', 'REPORTE', 'Restablecer el reporte', /vuelve a contar en el índice/],
    ['restablecer', 'FOTO', 'Restablecer la foto', /índice de desempeño no cambia/],
  ] as const)('%s %s: título «%s» y el aviso del alcance', (accion, alcance, titulo, aviso) => {
    montar(accion, alcance);
    expect(screen.getByRole('dialog', { name: titulo })).toBeInTheDocument();
    expect(screen.getByText(aviso)).toBeInTheDocument();
    // Decision del usuario (30/10): el aviso del motivo, en ocultar y en restablecer.
    expect(screen.getByText(AVISO_MOTIVO)).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveAccessibleDescription(expect.stringContaining(AVISO_MOTIVO));
  });

  it('exige el largo del motivo antes de enviar', async () => {
    const { onConfirmar } = montar('ocultar', 'FOTO');
    await userEvent.type(screen.getByLabelText('Motivo'), 'corto');
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar la foto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El motivo debe tener entre 10 y 500 caracteres.');
    expect(screen.getByLabelText('Motivo')).toHaveAttribute('aria-invalid', 'true');
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('con éxito confirma con el alcance y el motivo recortado, y cierra', async () => {
    const { onConfirmar, alCerrar } = montar('ocultar', 'FOTO');
    await userEvent.type(screen.getByLabelText('Motivo'), `  ${MOTIVO}  `);
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar la foto' }));

    await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith({ alcance: 'FOTO', motivo: MOTIVO }));
    await waitFor(() => expect(alCerrar).toHaveBeenCalled());
  });

  it('el 400 MOTIVO_IDENTIFICA_DENUNCIANTE va en el campo mientras el motivo no cambie', async () => {
    const mensaje = 'El motivo no puede incluir el correo de quien denunció: lo leerán el autor y la municipalidad';
    const { alCerrar } = montar('restablecer', 'REPORTE', { ok: false, campo: 'motivo', mensaje });
    const campo = screen.getByLabelText('Motivo');
    await userEvent.type(campo, 'Denunciado por ana@ejemplo.pe sin razón');
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer el reporte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription(expect.stringContaining(mensaje));
    expect(alCerrar).not.toHaveBeenCalled();

    // Al cambiar el motivo, el error del campo se va (lo dira el proximo envio).
    await userEvent.type(campo, ' x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un 409 del estado (desactualizado) cierra el diálogo: la pantalla lo explica', async () => {
    const { alCerrar } = montar('ocultar', 'REPORTE', {
      ok: false,
      campo: null,
      mensaje: 'El reporte ya está oculto',
      desactualizado: true,
    });
    await userEvent.type(screen.getByLabelText('Motivo'), MOTIVO);
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar el reporte' }));
    await waitFor(() => expect(alCerrar).toHaveBeenCalled());
  });

  it('otro error se muestra arriba y el diálogo sigue abierto', async () => {
    const { alCerrar } = montar('ocultar', 'REPORTE', {
      ok: false,
      campo: null,
      mensaje: 'Sin conexión con el servidor. Revisa tu red.',
      desactualizado: false,
    });
    await userEvent.type(screen.getByLabelText('Motivo'), MOTIVO);
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar el reporte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión con el servidor. Revisa tu red.');
    expect(alCerrar).not.toHaveBeenCalled();
  });

  it('Cancelar cierra sin confirmar', async () => {
    const { onConfirmar, alCerrar } = montar('ocultar', 'REPORTE');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(alCerrar).toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
  });
});
