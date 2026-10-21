import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { distritoPorCoordenadas, listarCategorias } from '@/lib/api/catalogos';
import type { CategoriaDano, Distrito } from '@/lib/types/domain';
import type { ReporteEnColaVisible } from '../hooks/useColaOffline';
import { PendientesDeEnvio } from './PendientesDeEnvio';

vi.mock('@/lib/api/catalogos', () => ({ distritoPorCoordenadas: vi.fn(), listarCategorias: vi.fn() }));

/** NC-02: reporte guardado por la version anterior, sin titulo ni severidad. */
const INCOMPLETO: ReporteEnColaVisible = {
  idempotencyKey: 'clave-vieja',
  usuarioId: 7,
  creadoEn: '2026-10-19T10:00:00.000Z',
  datos: { latitud: -12.12, longitud: -77.03, categoriaId: 3, ubicacionManual: false },
  foto: null,
  estado: 'pendiente',
  motivo: null,
  visible: 'incompleto',
};

function montar(onCompletar = vi.fn().mockResolvedValue(null)) {
  render(
    <PendientesDeEnvio
      pendientes={[INCOMPLETO]}
      onDescartar={vi.fn()}
      onReenviarConClaveNueva={vi.fn()}
      onCompletar={onCompletar}
    />,
  );
  return onCompletar;
}

beforeEach(() => {
  vi.mocked(distritoPorCoordenadas).mockResolvedValue({ id: 21, nombre: 'Miraflores' } as Distrito);
  vi.mocked(listarCategorias).mockResolvedValue([
    { id: 3, nombre: 'Bache', esEstandar: true } as CategoriaDano,
  ]);
});

describe('PendientesDeEnvio: reporte incompleto (NC-02)', () => {
  it('sugiere «<categoría> en <distrito>» y no elige severidad', async () => {
    montar();

    const aviso = screen.getByText('Le faltan el título y la severidad: complétalos para enviarlo.');
    // Aviso fijo, no una alerta (solo el error lo es).
    expect(aviso).not.toHaveAttribute('role');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Bache en Miraflores'));
    for (const nombre of ['Baja', 'Media', 'Alta']) {
      expect(screen.getByRole('radio', { name: nombre })).not.toBeChecked();
    }
    expect(listarCategorias).toHaveBeenCalledWith(21);
  });

  it('completa con la MISMA clave, lo escrito y la severidad elegida', async () => {
    const onCompletar = montar();
    const usuario = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Bache en Miraflores'));

    await usuario.clear(screen.getByLabelText('Título'));
    await usuario.type(screen.getByLabelText('Título'), 'Bache frente al parque');
    await usuario.click(screen.getByRole('radio', { name: 'Media' }));
    await usuario.click(screen.getByRole('button', { name: 'Completar' }));

    expect(onCompletar).toHaveBeenCalledWith('clave-vieja', {
      titulo: 'Bache frente al parque',
      severidad: 'MEDIA',
    });
  });

  it('sin sugerencia posible (fuera de cobertura o sin red) el título queda vacío', async () => {
    vi.mocked(distritoPorCoordenadas).mockRejectedValue(new Error('sin red'));
    vi.mocked(listarCategorias).mockRejectedValue(new Error('sin red'));
    montar();

    await waitFor(() => expect(listarCategorias).toHaveBeenCalled());
    expect(screen.getByLabelText('Título')).toHaveValue('');
  });

  it('sin severidad marca el grupo y no intenta completar', async () => {
    const onCompletar = montar();
    const usuario = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Bache en Miraflores'));

    await usuario.click(screen.getByRole('button', { name: 'Completar' }));

    const mensaje = await screen.findByText('Elige la severidad del daño.');
    const grupo = screen.getByRole('radiogroup', { name: 'Severidad' });
    expect(grupo).toHaveAttribute('aria-invalid', 'true');
    expect(grupo.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(onCompletar).not.toHaveBeenCalled();
  });

  it('muestra el motivo si no se pudo completar, y se puede descartar', async () => {
    const motivo = 'Este reporte ya no está por completar: pudo haberse completado o enviado en otra pestaña.';
    const onCompletar = montar(vi.fn().mockResolvedValue(motivo));
    const usuario = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Bache en Miraflores'));

    await usuario.click(screen.getByRole('radio', { name: 'Baja' }));
    await usuario.click(screen.getByRole('button', { name: 'Completar' }));

    expect(onCompletar).toHaveBeenCalledWith('clave-vieja', {
      titulo: 'Bache en Miraflores',
      severidad: 'BAJA',
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(motivo);
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
  });

  it('si solo falta la severidad, el aviso lo dice', () => {
    render(
      <PendientesDeEnvio
        pendientes={[{ ...INCOMPLETO, datos: { ...INCOMPLETO.datos, titulo: 'Bache en Surco' } }]}
        onDescartar={vi.fn()}
        onReenviarConClaveNueva={vi.fn()}
        onCompletar={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Le falta la severidad: complétala para enviarlo.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Bache en Surco');
  });
});
