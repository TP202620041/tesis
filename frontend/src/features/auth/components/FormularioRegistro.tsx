'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import { EnlaceConDialogo } from '@/components/ui/dialogo';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useRegistro } from '../hooks/useRegistro';
import { MENSAJE_FALTA_CAPTCHA, siteKeyDelCaptcha } from '../model/captcha';
import { AYUDA_PASSWORD, errorDeLargoDePassword, PASSWORD_MAX, PASSWORD_MIN } from '../model/password';
import { destinoTrasAcceso, RUTA_PRIVACIDAD } from '../model/rutas';
import { TITULO_TERMINOS } from '../model/terminos';
import { CampoCaptcha } from './CampoCaptcha';

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
 */
export function FormularioRegistro({ textoLegal }: { textoLegal: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enviando, error, terminosDesactualizados, enviar } = useRegistro();
  const [campos, setCampos] = useState({ nombre: '', apellido: '', email: '', password: '' });
  const [acepta, setAcepta] = useState(false);
  const [faltaAceptar, setFaltaAceptar] = useState(false);
  // QA-1 M-2: el largo de la contraseña se valida antes de enviar. El error
  // aparece tras el primer intento y desde ahi se recalcula al escribir.
  const [intentoEnviar, setIntentoEnviar] = useState(false);
  const errorPassword = intentoEnviar ? errorDeLargoDePassword(campos.password) : null;
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
    const sinCaptcha = siteKey !== null && !captchaToken;
    if (sinCaptcha) setFaltaCaptcha(true);
    if (!acepta || sinCaptcha || errorDeLargoDePassword(campos.password)) return;
    const { sesion, terminosDesactualizados: textoViejo } = await enviar(campos, siteKey ? captchaToken : null);
    if (!sesion && siteKey) {
      // NC-08: el token ya se gasto (o lo rechazo Google): casilla nueva.
      setCaptchaToken(null);
      setReiniciosCaptcha((n) => n + 1);
    }
    if (sesion) {
      // QA-1 I-2: al mismo lugar que el login (antes iba a `/sesion`, una
      // pantalla de depuracion): al `?redirect=` si es interno, si no a
      // «Mis reportes».
      router.push(destinoTrasAcceso(sesion.usuario, searchParams.get('redirect')));
      router.refresh();
    } else if (textoViejo) {
      // Si el texto quedo viejo, la aceptacion ya no vale: debe releerlo.
      // Ante cualquier otro error (correo ya registrado, validacion, red) la
      // casilla sigue marcada: el texto aceptado no cambio (QA-1 M-2).
      setAcepta(false);
    }
  }

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

      {siteKey && (
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
