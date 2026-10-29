import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

const TEXTO_LEGAL = <p>1. Quiénes somos</p>;

// jsdom no implementa `showModal`/`close` de <dialog>: lo minimo del
// navegador (el atributo `open` y el evento `close`, que tambien dispara Esc).
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

beforeEach(() => {
  parametros.valor = new URLSearchParams();
});

afterEach(() => {
  push.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe('FormularioRegistro (NC-07b)', () => {
  // NC-09: recien registrado no hay sesion, solo la cuenta por confirmar.
  const CUENTA = { email: 'ana@lima.pe', vigenciaEnlaceHoras: 24 };

  // Sin site key de Turnstile (NC-08b) no hay widget: estos tests no deben
  // depender de que la variable este definida en el entorno de quien los corre.
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function conRegistro(enviar = vi.fn().mockResolvedValue({ cuenta: CUENTA, terminosDesactualizados: false })) {
    vi.mocked(useRegistro).mockReturnValue({
      enviando: false,
      error: null,
      errorDelCorreo: null,
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
    render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
    const usuario = await llenar();

    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/debes aceptar los términos/);
  });

  it('con la casilla marcada envía y enlaza a /privacidad', async () => {
    const enviar = conRegistro();
    render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
    const usuario = await llenar();

    expect(screen.getByRole('link', { name: /términos de uso y la política de privacidad/ })).toHaveAttribute(
      'href',
      '/privacidad',
    );
    await usuario.click(screen.getByRole('checkbox'));
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    // Sin site key de Turnstile (NC-08b) el token va como `null`.
    expect(enviar).toHaveBeenCalledWith(
      {
        nombre: 'Ana',
        apellido: 'Ruiz',
        email: 'ana@lima.pe',
        password: 'secreta123',
      },
      null,
    );
    // NC-09: la cuenta nace sin confirmar y sin sesión: no se navega a
    // ninguna pantalla privada, se pide revisar el correo.
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
  });

  it('el login de «Revisa tu correo» conserva el ?redirect= interno (p. ej. desde /reportar)', async () => {
    parametros.valor = new URLSearchParams('redirect=/reportar');
    conRegistro();
    render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
    const usuario = await llenar();

    await usuario.click(screen.getByRole('checkbox'));
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Freportar',
    );
  });

  it('un ?redirect= a otro sitio se ignora', async () => {
    parametros.valor = new URLSearchParams('redirect=https://otro.example');
    conRegistro();
    render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
    const usuario = await llenar();

    await usuario.click(screen.getByRole('checkbox'));
    await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute('href', '/login');
  });

  describe('QA-1 M-2', () => {
    it('dice el mínimo de la contraseña antes de enviar', () => {
      conRegistro();
      render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
      expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Mínimo 8 caracteres.');
    });

    it('con una contraseña corta no envía y lo explica en castellano', async () => {
      const enviar = conRegistro();
      render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
      const usuario = userEvent.setup();
      await usuario.type(screen.getByLabelText('Contraseña'), 'abc');
      await usuario.click(screen.getByRole('checkbox'));
      await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

      expect(enviar).not.toHaveBeenCalled();
      const campo = screen.getByLabelText('Contraseña');
      expect(campo).toHaveAttribute('aria-invalid', 'true');
      expect(campo).toHaveAccessibleDescription(/al menos 8 caracteres/);
      // La casilla ya marcada no se toca.
      expect(screen.getByRole('checkbox')).toBeChecked();

      // Al corregirla, el error se va solo.
      await usuario.type(campo, 'defghi');
      expect(campo).not.toHaveAttribute('aria-invalid');
    });

    it('un error que no es de los términos (p. ej. correo ya registrado) deja la casilla marcada', async () => {
      const enviar = conRegistro(vi.fn().mockResolvedValue({ cuenta: null, terminosDesactualizados: false }));
      render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
      const usuario = await llenar();
      await usuario.click(screen.getByRole('checkbox'));
      await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

      expect(enviar).toHaveBeenCalled();
      expect(screen.getByRole('checkbox')).toBeChecked();
      expect(push).not.toHaveBeenCalled();
    });

    it('con los términos desactualizados sí la desmarca: hay que leer el texto nuevo', async () => {
      conRegistro(vi.fn().mockResolvedValue({ cuenta: null, terminosDesactualizados: true }));
      render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
      const usuario = await llenar();
      await usuario.click(screen.getByRole('checkbox'));
      await usuario.click(screen.getByRole('button', { name: 'Crear cuenta' }));

      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });
  });

  it('muestra los términos en un diálogo sin salir del formulario ni perder lo escrito', async () => {
    const enviar = conRegistro();
    render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
    const usuario = await llenar();
    const enlace = screen.getByRole('link', { name: /términos de uso y la política de privacidad/ });
    expect(enlace).not.toHaveAttribute('target');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await usuario.click(enlace);
    const dialogo = screen.getByRole('dialog', { name: 'Términos de uso y política de privacidad' });
    expect(within(dialogo).getByText('1. Quiénes somos')).toBeInTheDocument();
    // Leer el texto no marca la casilla ni envía el formulario.
    await usuario.click(within(dialogo).getByText('1. Quiénes somos'));
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
    expect(screen.getByLabelText('Apellido')).toHaveValue('Ruiz');
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('ana@lima.pe');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('secreta123');

    // Esc: el navegador cierra el <dialog> y emite `close`. jsdom no tiene esa
    // tecla, asi que se prueba el camino `close` → `alCerrar` (la tecla se
    // verifico en Chrome).
    await usuario.click(enlace);
    (screen.getByRole('dialog') as HTMLDialogElement).close();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
  });

  it('con los términos desactualizados pide recargar', () => {
    vi.mocked(useRegistro).mockReturnValue({
      enviando: false,
      error: { mensaje: 'La version de los terminos aceptada no es la vigente', detalles: [] },
      errorDelCorreo: null,
      terminosDesactualizados: true,
      enviar: vi.fn(),
    });
    render(<FormularioRegistro textoLegal={TEXTO_LEGAL} />);
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
    render(<PrivacidadYConsentimientos consentimientos={c} textoLegal={<p>Texto legal</p>} />);
    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole('button', { name: 'Retirar consentimiento' }));
    await usuario.click(screen.getByRole('button', { name: 'Otorgar consentimiento' }));

    expect(c.revocar).toHaveBeenCalledWith('NOTIFICACIONES_CORREO');
    expect(c.otorgar).toHaveBeenCalledWith('NOTIFICACIONES_PUSH');
  });

  it('no ofrece revocar los términos y explica que es la baja de la cuenta', () => {
    render(<PrivacidadYConsentimientos consentimientos={estado()} textoLegal={<p>Texto legal</p>} />);
    // Solo dos botones: uno por aviso opcional.
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText(/hay que cerrar la cuenta/)).toBeInTheDocument();
  });

  it('«Leer el texto» abre los términos en un diálogo, sin otra pestaña', async () => {
    render(<PrivacidadYConsentimientos consentimientos={estado()} textoLegal={<p>Texto legal</p>} />);
    const enlace = screen.getByRole('link', { name: 'Leer el texto' });
    expect(enlace).toHaveAttribute('href', '/privacidad');
    expect(enlace).not.toHaveAttribute('target');

    await userEvent.setup().click(enlace);

    const dialogo = screen.getByRole('dialog', { name: 'Términos de uso y política de privacidad' });
    expect(within(dialogo).getByText('Texto legal')).toBeInTheDocument();
  });

  it('muestra el historial con las revocaciones', () => {
    render(<PrivacidadYConsentimientos consentimientos={estado()} textoLegal={<p>Texto legal</p>} />);
    expect(screen.getByText('Historial de consentimientos')).toBeInTheDocument();
    expect(screen.getByText(/Revocado/)).toBeInTheDocument();
  });
});
