import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Usuario } from '@/lib/types/domain';
import { useAceptarTerminos } from '../hooks/useAceptarTerminos';
import type { EstadoConsentimientos } from '../hooks/useConsentimientos';
import { useRegistro } from '../hooks/useRegistro';
import type { Consentimientos } from '../model/consentimientos';
import { AceptarTerminos } from './AceptarTerminos';
import { FormularioRegistro } from './FormularioRegistro';
import { PrivacidadYConsentimientos } from './PrivacidadYConsentimientos';

const { push, replace, refresh, parametros } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  parametros: { valor: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => parametros.valor,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('../hooks/useRegistro', () => ({ useRegistro: vi.fn() }));
vi.mock('../hooks/useAceptarTerminos', () => ({ useAceptarTerminos: vi.fn() }));
vi.mock('./BotonCerrarSesion', () => ({ BotonCerrarSesion: () => <button type="button">Cerrar sesión</button> }));

const USUARIO: Usuario = {
  id: 1,
  email: 'ana@lima.pe',
  nombre: 'Ana',
  apellido: 'Vecina',
  rol: 'CIUDADANO',
  preferenciaNotificacion: 'EMAIL',
  debeAceptarTerminos: true,
};

beforeEach(() => {
  parametros.valor = new URLSearchParams();
});

afterEach(() => {
  push.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe('FormularioRegistro (NC-07b)', () => {
  function conRegistro(enviar = vi.fn().mockResolvedValue({ usuario: USUARIO })) {
    vi.mocked(useRegistro).mockReturnValue({
      enviando: false,
      error: null,
      terminosDesactualizados: false,
      enviar,
    });
    return enviar;
  }

  async function llenar() {
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('Nombre'), 'Ana');
    await usuario.type(screen.getByLabelText('Apellido'), 'Ruiz');
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'ana@lima.pe');
    await usuario.type(screen.getByLabelText('Contraseña'), 'secreta123');
    return usuario;
  }

  it('sin marcar la casilla no envía y explica por qué', async () => {
    const enviar = conRegistro();
    render(<FormularioRegistro />);
    const usuario = await llenar();

    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/debes aceptar los términos/);
  });

  it('con la casilla marcada envía y enlaza a /privacidad', async () => {
    const enviar = conRegistro();
    render(<FormularioRegistro />);
    const usuario = await llenar();

    expect(screen.getByRole('link', { name: /términos de uso y la política de privacidad/ })).toHaveAttribute(
      'href',
      '/privacidad',
    );
    await usuario.click(screen.getByRole('checkbox'));
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(enviar).toHaveBeenCalledWith({
      nombre: 'Ana',
      apellido: 'Ruiz',
      email: 'ana@lima.pe',
      password: 'secreta123',
    });
    expect(push).toHaveBeenCalledWith('/sesion');
  });

  it('con los términos desactualizados pide recargar', () => {
    vi.mocked(useRegistro).mockReturnValue({
      enviando: false,
      error: { mensaje: 'La version de los terminos aceptada no es la vigente', detalles: [] },
      terminosDesactualizados: true,
      enviar: vi.fn(),
    });
    render(<FormularioRegistro />);
    expect(screen.getByRole('status')).toHaveTextContent(/no se creó la cuenta/);
    expect(screen.getByRole('status')).toHaveTextContent(/se está actualizando/);
    // Sin sesión ni términos aceptados no hay Soporte al que mandarlo.
    expect(screen.getByRole('status')).not.toHaveTextContent(/Soporte/);
    expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeInTheDocument();
  });
});

describe('AceptarTerminos (D-12)', () => {
  function conAceptacion(extra: Partial<ReturnType<typeof useAceptarTerminos>> = {}) {
    const aceptar = vi.fn().mockResolvedValue({ avisosFallidos: [] });
    vi.mocked(useAceptarTerminos).mockReturnValue({
      carga: {
        estado: 'listo',
        datos: { versionTerminosVigente: '2026-10-v1', debeAceptarTerminos: true, vigentes: [], historial: [] },
        error: null,
        recargar: vi.fn(),
        recargando: false,
      },
      version: '2026-10-v1',
      enviando: false,
      error: null,
      aceptar,
      ...extra,
    });
    return aceptar;
  }

  it('exige la casilla obligatoria, guarda los avisos elegidos y vuelve al destino', async () => {
    parametros.valor = new URLSearchParams('redirect=/mis-reportes/7');
    const aceptar = conAceptacion();
    render(<AceptarTerminos usuario={USUARIO} texto={<p>Texto legal</p>} />);
    const usuario = userEvent.setup();

    expect(screen.getByText('Texto legal')).toBeInTheDocument();
    const boton = screen.getByRole('button', { name: 'Aceptar y continuar' });
    expect(boton).toBeDisabled();

    await usuario.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
    await usuario.click(screen.getByRole('checkbox', { name: /Notificaciones por correo/ }));
    await usuario.click(boton);

    expect(aceptar).toHaveBeenCalledWith(['NOTIFICACIONES_CORREO']);
    expect(replace).toHaveBeenCalledWith('/mis-reportes/7');
  });

  it('un redirect externo se ignora y va al inicio del rol', async () => {
    parametros.valor = new URLSearchParams('redirect=//evil.example');
    conAceptacion();
    render(<AceptarTerminos usuario={USUARIO} texto={null} />);
    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
    await usuario.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));

    expect(replace).toHaveBeenCalledWith('/mis-reportes');
  });

  it('si la versión del servidor no es la del texto de la app, no deja aceptar', () => {
    conAceptacion({ version: '2026-11-v2' });
    render(<AceptarTerminos usuario={USUARIO} texto={null} />);
    expect(screen.getByRole('checkbox', { name: /Acepto los términos/ })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/todavía no está disponible/);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/Soporte/);
  });

  it('al funcionario no le ofrece avisos de reportes', () => {
    conAceptacion();
    render(<AceptarTerminos usuario={{ ...USUARIO, rol: 'FUNCIONARIO_MUNICIPAL' }} texto={null} />);
    expect(screen.queryByRole('checkbox', { name: /Notificaciones/ })).not.toBeInTheDocument();
  });

  it('quien ya aceptó vuelve al destino sin ver la pantalla', () => {
    parametros.valor = new URLSearchParams('redirect=/bandeja');
    conAceptacion({
      carga: {
        estado: 'listo',
        datos: { versionTerminosVigente: '2026-10-v1', debeAceptarTerminos: false, vigentes: [], historial: [] },
        error: null,
        recargar: vi.fn(),
        recargando: false,
      },
    });
    render(<AceptarTerminos usuario={USUARIO} texto={null} />);
    expect(replace).toHaveBeenCalledWith('/bandeja');
  });

  it('si un aviso no se guardó, lo dice y deja continuar', async () => {
    const aceptar = conAceptacion();
    aceptar.mockResolvedValue({ avisosFallidos: ['NOTIFICACIONES_PUSH'] });
    render(<AceptarTerminos usuario={USUARIO} texto={null} />);
    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
    await usuario.click(screen.getByRole('checkbox', { name: /Notificaciones push/ }));
    await usuario.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/No se pudo guardar: Notificaciones push/);
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(replace).toHaveBeenCalledWith('/mis-reportes');
  });
});

describe('PrivacidadYConsentimientos (perfil)', () => {
  const DATOS: Consentimientos = {
    versionTerminosVigente: '2026-10-v1',
    debeAceptarTerminos: false,
    vigentes: [
      {
        id: 12,
        finalidad: 'TERMINOS_Y_PRIVACIDAD',
        versionDocumento: '2026-10-v1',
        aceptadoEn: '2026-10-19T15:02:11.481Z',
        revocadoEn: null,
        vigente: true,
      },
      {
        id: 15,
        finalidad: 'NOTIFICACIONES_CORREO',
        versionDocumento: 'correo-2026-10-v1',
        aceptadoEn: '2026-10-19T15:03:00.000Z',
        revocadoEn: null,
        vigente: true,
      },
    ],
    historial: [
      {
        id: 14,
        finalidad: 'NOTIFICACIONES_PUSH',
        versionDocumento: 'push-2026-10-v1',
        aceptadoEn: '2026-10-19T15:05:40.010Z',
        revocadoEn: '2026-10-19T15:09:02.334Z',
        vigente: false,
      },
    ],
  };

  function estado(): EstadoConsentimientos {
    return {
      carga: { estado: 'listo', datos: DATOS, error: null, recargar: vi.fn(), recargando: false },
      procesando: null,
      error: null,
      otorgar: vi.fn().mockResolvedValue(true),
      revocar: vi.fn().mockResolvedValue(true),
    };
  }

  it('retira el correo vigente y otorga el push que falta', async () => {
    const c = estado();
    render(<PrivacidadYConsentimientos consentimientos={c} />);
    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole('button', { name: 'Retirar consentimiento' }));
    await usuario.click(screen.getByRole('button', { name: 'Otorgar consentimiento' }));

    expect(c.revocar).toHaveBeenCalledWith('NOTIFICACIONES_CORREO');
    expect(c.otorgar).toHaveBeenCalledWith('NOTIFICACIONES_PUSH');
  });

  it('no ofrece revocar los términos y explica que es la baja de la cuenta', () => {
    render(<PrivacidadYConsentimientos consentimientos={estado()} />);
    // Solo dos botones: uno por aviso opcional.
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText(/hay que cerrar la cuenta/)).toBeInTheDocument();
  });

  it('muestra el historial con las revocaciones', () => {
    render(<PrivacidadYConsentimientos consentimientos={estado()} />);
    expect(screen.getByText('Historial de consentimientos')).toBeInTheDocument();
    expect(screen.getByText(/Revocado/)).toBeInTheDocument();
  });
});
