'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import { EnlaceConDialogo } from '@/components/ui/dialogo';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import type { CuentaPorConfirmar } from '@/lib/types/domain';
import { useRegistro } from '../hooks/useRegistro';
import { captchaConfigurado, MENSAJE_FALTA_CAPTCHA, siteKeyDelCaptcha } from '../model/captcha';
import { AYUDA_PASSWORD, errorDeLargoDePassword, PASSWORD_MAX, PASSWORD_MIN } from '../model/password';
import { conRedirect, RUTA_LOGIN, RUTA_PRIVACIDAD } from '../model/rutas';
import { TITULO_TERMINOS } from '../model/terminos';
import { CampoCaptcha } from './CampoCaptcha';
import { RegistroEnviado } from './RegistroEnviado';

/**
 * US-01: registro de cuenta ciudadana.
 *
 * El backend siempre crea rol CIUDADANO desde este endpoint (las cuentas de
 * funcionario las provisiona la municipalidad), por eso el formulario no
 * ofrece elegir rol.
 *
 * NC-07b (D-12): aceptar los terminos de uso y la politica de privacidad es
 * obligatorio. Sin la casilla marcada no se envia nada; el backend lo exige
 * igual (400) y guarda la aceptacion con su version en la misma transaccion
 * que crea la cuenta.
 *
 * El texto se lee en un dialogo sobre el mismo formulario, no en otra
 * pestana ni navegando a `/privacidad`: asi no se pierde lo ya escrito.
 * `textoLegal` lo compone la pagina porque es de la feature `legal`.
 *
 * NC-08: con site key configurada, la casilla «No soy un robot» de
 * reCAPTCHA v2 tambien es obligatoria (sin token no se envia nada) y tras
 * CUALQUIER error del registro se reinicia: el token es de un solo uso y el
 * backend ya lo consumio al verificarlo. Sin site key (local, backend con
 * `CAPTCHA_TIPO=ninguno`) no se muestra el widget ni se envia token.
 *
 * NC-09: crear la cuenta NO inicia sesion. Si sale bien, el formulario se
 * reemplaza por «Revisa tu correo» ({@link RegistroEnviado}); el enlace al
 * login conserva el `?redirect=`, para volver a donde iba tras confirmar.
 * Los 409 del dominio del correo (desechable, sin MX) se muestran en el
 * campo del correo mientras no se cambie lo escrito.
 */
export function FormularioRegistro({ textoLegal }: { textoLegal: ReactNode }) {
  const searchParams = useSearchParams();
  const { enviando, error, errorDelCorreo, terminosDesactualizados, enviar } = useRegistro();
  const [cuenta, setCuenta] = useState<CuentaPorConfirmar | null>(null);
  const [campos, setCampos] = useState({ nombre: '', apellido: '', email: '', password: '' });
  // Correo del ultimo envio: el error del dominio se refiere a ese texto y
  // deja de mostrarse en cuanto se corrige.
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [faltaAceptar, setFaltaAceptar] = useState(false);
  // QA-1 M-2: el largo de la contraseña se valida antes de enviar. El error
  // aparece tras el primer intento y desde ahi se recalcula al escribir.
  const [intentoEnviar, setIntentoEnviar] = useState(false);
  const errorPassword = intentoEnviar ? errorDeLargoDePassword(campos.password) : null;
  const conCaptcha = captchaConfigurado();
  const siteKey = siteKeyDelCaptcha();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [faltaCaptcha, setFaltaCaptcha] = useState(false);
  const [reiniciosCaptcha, setReiniciosCaptcha] = useState(0);
  const alTokenDelCaptcha = useCallback((token: string | null) => {
    setCaptchaToken(token);
    if (token) setFaltaCaptcha(false);
  }, []);

  function actualizar(clave: keyof typeof campos) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setCampos((previos) => ({ ...previos, [clave]: e.target.value }));
  }

  async function alEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setIntentoEnviar(true);
    if (!acepta) setFaltaAceptar(true);
    const sinCaptcha = conCaptcha && !captchaToken;
    if (sinCaptcha) setFaltaCaptcha(true);
    if (!acepta || sinCaptcha || errorDeLargoDePassword(campos.password)) return;
    setEmailEnviado(campos.email);
    const { cuenta: creada, terminosDesactualizados: textoViejo } = await enviar(
      campos,
      conCaptcha ? captchaToken : null,
    );
    if (!creada && conCaptcha) {
      // NC-08: el token ya se gasto (o lo rechazo Google): casilla nueva.
      setCaptchaToken(null);
      setReiniciosCaptcha((n) => n + 1);
    }
    if (creada) {
      setCuenta(creada);
    } else if (textoViejo) {
      // Si el texto quedo viejo, la aceptacion ya no vale: debe releerlo.
      // Ante cualquier otro error (correo ya registrado, validacion, red) la
      // casilla sigue marcada: el texto aceptado no cambio (QA-1 M-2).
      setAcepta(false);
    }
  }

  if (cuenta) {
    return <RegistroEnviado cuenta={cuenta} rutaLogin={conRedirect(RUTA_LOGIN, searchParams.get('redirect'))} />;
  }

  const errorEmail = errorDelCorreo && campos.email === emailEnviado ? errorDelCorreo : undefined;

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-4" noValidate>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
      {terminosDesactualizados && (
        <p
          role="status"
          className="border border-aviso-borde rounded-control bg-aviso-fondo px-3 py-2 text-sm text-aviso-texto"
        >
          Los términos cambiaron y no se creó la cuenta. La aplicación se está actualizando;
          vuelve a intentarlo en unos minutos y lee el texto nuevo antes de aceptar.{' '}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-medium underline"
          >
            Volver a intentar
          </button>
        </p>
      )}
      <Campo
        id="nombre"
        etiqueta="Nombre"
        autoComplete="given-name"
        required
        value={campos.nombre}
        onChange={actualizar('nombre')}
      />
      <Campo
        id="apellido"
        etiqueta="Apellido"
        autoComplete="family-name"
        required
        value={campos.apellido}
        onChange={actualizar('apellido')}
      />
      <Campo
        id="email"
        etiqueta="Correo electrónico"
        type="email"
        autoComplete="email"
        required
        error={errorEmail}
        value={campos.email}
        onChange={actualizar('email')}
      />
      <Campo
        id="password"
        etiqueta="Contraseña"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        ayuda={AYUDA_PASSWORD}
        error={errorPassword ?? undefined}
        value={campos.password}
        onChange={actualizar('password')}
      />

      {conCaptcha && siteKey && (
        <div className="flex flex-col gap-1">
          <CampoCaptcha
            siteKey={siteKey}
            onToken={alTokenDelCaptcha}
            reinicios={reiniciosCaptcha}
            idError={faltaCaptcha && !captchaToken ? 'captcha-error' : undefined}
          />
          {faltaCaptcha && !captchaToken && (
            <p id="captcha-error" role="alert" className="text-sm text-error">
              {MENSAJE_FALTA_CAPTCHA}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm text-texto">
          <input
            id="acepta-terminos"
            type="checkbox"
            required
            checked={acepta}
            aria-invalid={faltaAceptar && !acepta ? true : undefined}
            aria-describedby={faltaAceptar && !acepta ? 'acepta-terminos-error' : undefined}
            onChange={(e) => {
              setAcepta(e.target.checked);
              if (e.target.checked) setFaltaAceptar(false);
            }}
            className="mt-0.5"
          />
          <span>
            Acepto los{' '}
            <EnlaceConDialogo
              href={RUTA_PRIVACIDAD}
              titulo={TITULO_TERMINOS}
              contenido={textoLegal}
              className="font-medium text-enlace hover:underline"
            >
              términos de uso y la política de privacidad
            </EnlaceConDialogo>
          </span>
        </label>
        {faltaAceptar && !acepta && (
          <p id="acepta-terminos-error" role="alert" className="text-sm text-error">
            Para crear la cuenta debes aceptar los términos de uso y la política de privacidad.
          </p>
        )}
      </div>

      <Boton cargando={enviando}>Crear cuenta</Boton>
    </form>
  );
}
