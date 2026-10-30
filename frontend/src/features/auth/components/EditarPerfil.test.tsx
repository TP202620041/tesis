import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listarDistritos } from '@/lib/api/catalogos';
import { ApiError } from '@/lib/api/errors';
import type { Usuario } from '@/lib/types/domain';
import { editarPerfil } from '../api';
import { EditarPerfil } from './EditarPerfil';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('../api', () => ({ editarPerfil: vi.fn(), actualizarPreferenciaNotificacion: vi.fn() }));
vi.mock('@/lib/api/catalogos', () => ({ listarDistritos: vi.fn() }));
// Lo que no es del formulario de datos queda fuera: tiene sus propios tests.
vi.mock('../hooks/useConsentimientos', () => ({ useConsentimientos: () => ({}) }));
vi.mock('../hooks/usePushEnEsteNavegador', () => ({ usePushEnEsteNavegador: () => ({}) }));
vi.mock('./FotoDePerfil', () => ({ FotoDePerfil: () => null }));
vi.mock('./PrivacidadYConsentimientos', () => ({ PrivacidadYConsentimientos: () => null }));
vi.mock('./PushEnEsteNavegador', () => ({ PushEnEsteNavegador: () => null }));
vi.mock('./SelectorDeApariencia', () => ({ SelectorDeApariencia: () => null }));
vi.mock('./AccionesDeLaCuenta', () => ({
  AccionesDeLaCuenta: ({ rol }: { rol: string }) => <p>Acciones de la cuenta de {rol}</p>,
}));

const ANA: Usuario = {
  id: 1,
  email: 'ana@lima.pe',
  nombre: 'Ana',
  apellido: 'Vecina',
  rol: 'CIUDADANO',
  preferenciaNotificacion: 'EMAIL',
  debeAceptarTerminos: false,
};

const MB = 1024 * 1024;

/** Un `File` que dice pesar `bytes` sin reservarlos. */
function archivo(nombre: string, tipo: string, bytes = 2 * MB): File {
  const f = new File(['x'], nombre, { type: tipo });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

beforeEach(() => {
  vi.mocked(listarDistritos).mockResolvedValue([]);
  vi.mocked(editarPerfil).mockResolvedValue(ANA);
});

afterEach(() => {
  vi.mocked(editarPerfil).mockReset();
  vi.mocked(listarDistritos).mockReset();
});

// `applyAccept: false`: el selector del sistema deja elegir «Todos los
// archivos», así que el `accept` no basta y la regla tiene que atajarlo.
function montar() {
  const usuario = userEvent.setup({ applyAccept: false });
  render(<EditarPerfil inicial={ANA} textoLegal={null} />);
  const campo = screen.getByLabelText('Foto de perfil (opcional)');
  const guardar = () => usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  return { usuario, campo, guardar };
}

describe('EditarPerfil: la pantalla de «Cuenta» del ciudadano', () => {
  it('termina con Soporte y «Cerrar sesión», y ya no lleva «Volver a mis reportes»', () => {
    // Prueba en iPhone del 23/10: en el móvil esta es la pantalla de «Cuenta».
    montar();
    expect(screen.getByText('Acciones de la cuenta de CIUDADANO')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /volver a mis reportes/i })).toBeNull();
  });
});

describe('EditarPerfil: foto de perfil (US-30, DEP-11)', () => {
  it('el selector acepta solo JPG, PNG y WEBP y dice el límite', () => {
    const { campo } = montar();
    expect(campo).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(campo).toHaveAccessibleDescription('JPG, PNG o WEBP, de hasta 10 MB.');
  });

  it('más de 10 MB: no se envía, el aviso queda en el campo y se guarda el resto', async () => {
    const { usuario, campo, guardar } = montar();

    await usuario.upload(campo, archivo('perfil.jpg', 'image/jpeg', 10 * MB + 1));

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('La foto supera 10 MB.');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo.getAttribute('aria-describedby')).toContain(alerta.id);
    expect(screen.queryByText(/Se subirá/)).not.toBeInTheDocument();

    await guardar();

    await screen.findByText('Tus datos quedaron guardados.');
    expect(editarPerfil).toHaveBeenCalledWith({
      nombre: 'Ana',
      apellido: 'Vecina',
      distritoId: null,
      foto: null,
    });
    // El motivo sigue a la vista: la foto no se subió.
    expect(screen.getByText('La foto supera 10 MB.')).toBeInTheDocument();
  });

  it('otro formato: el mismo aviso que la foto del reporte', async () => {
    const { usuario, campo } = montar();

    await usuario.upload(campo, archivo('perfil.gif', 'image/gif'));

    expect(screen.getByRole('alert')).toHaveTextContent('Formato no permitido. Usa JPG, PNG o WEBP.');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
  });

  it('una foto válida se envía, borra el aviso anterior y tras guardar deja de mostrarse', async () => {
    const { usuario, campo, guardar } = montar();
    await usuario.upload(campo, archivo('perfil.jpg', 'image/jpeg', 11 * MB));
    const foto = archivo('perfil.png', 'image/png', 10 * MB);

    await usuario.upload(campo, foto);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(campo).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Se subirá: perfil.png')).toBeInTheDocument();

    await guardar();

    await screen.findByText('Tus datos quedaron guardados.');
    expect(editarPerfil).toHaveBeenCalledWith(expect.objectContaining({ foto }));
    expect(screen.queryByText(/Se subirá/)).not.toBeInTheDocument();
  });

  it.each([
    [503, 'Hay muchas fotos procesandose en este momento. Intenta de nuevo en unos segundos.'],
    [409, 'Formato de foto no permitido: el archivo no es una imagen JPG, PNG o WEBP valida'],
  ])('un %i del API se muestra con su mensaje y la foto sigue elegida', async (status, mensaje) => {
    vi.mocked(editarPerfil).mockRejectedValue(new ApiError(status, mensaje, '/api/auth/me'));
    const { usuario, campo, guardar } = montar();
    await usuario.upload(campo, archivo('perfil.jpg', 'image/jpeg'));

    await guardar();

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
    expect(screen.queryByText('Tus datos quedaron guardados.')).not.toBeInTheDocument();
    // Para reintentar no hay que volver a elegirla.
    expect(screen.getByText('Se subirá: perfil.jpg')).toBeInTheDocument();
  });
});

describe('EditarPerfil: la moderación del nombre (NC-10c)', () => {
  const NOMBRE = 'El nombre tiene palabras que no están permitidas. Cámbialo para continuar.';
  const APELLIDO = 'El apellido tiene palabras que no están permitidas. Cámbialo para continuar.';
  const textoNoPermitido = (campo: string, mensaje: string) =>
    new ApiError(400, mensaje, '/api/auth/me', [campo], 'TEXTO_NO_PERMITIDO');

  it('400 TEXTO_NO_PERMITIDO en el nombre: el error va en el campo, no arriba', async () => {
    vi.mocked(editarPerfil).mockRejectedValue(textoNoPermitido('nombre', NOMBRE));
    const { usuario, guardar } = montar();
    const nombre = screen.getByLabelText('Nombre');
    await usuario.clear(nombre);
    await usuario.type(nombre, 'Anita grosera');

    await guardar();

    await waitFor(() => expect(nombre).toHaveAttribute('aria-invalid', 'true'));
    expect(nombre).toHaveAccessibleDescription(NOMBRE);
    expect(nombre).toHaveValue('Anita grosera');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText('Tus datos quedaron guardados.')).not.toBeInTheDocument();

    await usuario.type(nombre, 's');
    expect(nombre).not.toHaveAttribute('aria-invalid');
  });

  it('400 TEXTO_NO_PERMITIDO en el apellido: el error va en el apellido', async () => {
    vi.mocked(editarPerfil).mockRejectedValue(textoNoPermitido('apellido', APELLIDO));
    const { guardar } = montar();

    await guardar();

    const apellido = screen.getByLabelText('Apellido');
    await waitFor(() => expect(apellido).toHaveAttribute('aria-invalid', 'true'));
    expect(apellido).toHaveAccessibleDescription(APELLIDO);
    expect(screen.getByLabelText('Nombre')).not.toHaveAttribute('aria-invalid');
  });
});
