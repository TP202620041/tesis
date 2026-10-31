'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useRecuperarPassword } from '../hooks/useRecuperarPassword';
import { AVISO_RECUPERACION_SIN_CONFIRMAR } from '../model/confirmacion';
import { PASSWORD_MAX, PASSWORD_MIN } from '../model/password';
import { clasesDeBoton } from '@/components/ui/Boton';
import { ReenviarConfirmacion } from './ReenviarConfirmacion';

const ENLACE = 'font-medium text-enlace hover:underline';
const TEXTO = 'text-sm text-texto-2';

/**
 * US-03: recuperar la contraseña en dos pasos (correo → token y contraseña
 * nueva) y volver al login. NC-09c: tras pedir el token ofrece reenviar el
 * enlace de confirmación (ver `TokenPedido`).
 */
export function RecuperarPassword() {
  const { paso, correo, enviando, error, pedirToken, restablecer, irAPaso } =
    useRecuperarPassword();

  if (paso === 'listo') {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className={TEXTO}>
          Tu contraseña se actualizó. Ya puedes iniciar sesión con la contraseña nueva.
        </p>
        <Link
          href="/login"
          className={clasesDeBoton('primario')}
        >
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
      {paso === 'correo' ? (
        <PasoCorreo enviando={enviando} onEnviar={pedirToken} onYaTengoToken={() => irAPaso('token')} />
      ) : (
        <>
          <TokenPedido correo={correo} />
          <PasoToken enviando={enviando} onEnviar={restablecer} onVolver={() => irAPaso('correo')} />
        </>
      )}
      <p className={TEXTO}>
        <Link href="/login" className={ENLACE}>
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}

function PasoCorreo({
  enviando,
  onEnviar,
  onYaTengoToken,
}: {
  enviando: boolean;
  onEnviar: (email: string) => void;
  onYaTengoToken: () => void;
}) {
  const [email, setEmail] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar(email);
      }}
    >
      <p className={TEXTO}>
        Escribe el correo de tu cuenta. Te enviaremos un token para crear una contraseña nueva.
      </p>
      <Campo
        id="email"
        etiqueta="Correo electrónico"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Boton cargando={enviando}>Enviar token</Boton>
      <button type="button" onClick={onYaTengoToken} className={`${ENLACE} self-start text-sm`}>
        Ya tengo un token
      </button>
    </form>
  );
}

/**
 * Mensaje del paso 2. Nunca confirma que la cuenta exista: el backend
 * responde igual en todos los casos.
 *
 * NC-09c: si se pidió el token con un correo, el mensaje suma que a una
 * cuenta sin confirmar no le llegará (NC-09b) y, al lado, «Reenviar el
 * enlace» de confirmación a ese mismo correo. Va siempre, haya o no cuenta,
 * así que tampoco revela nada; el reenvío responde 202 siempre y muestra su
 * propio mensaje neutro. Va fuera del `<form>` del token porque
 * `ReenviarConfirmacion` tiene el suyo (no se anidan).
 */
function TokenPedido({ correo }: { correo: string | null }) {
  if (!correo) {
    return (
      <p role="status" className={TEXTO}>
        Ingresa el token que recibiste por correo.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className={TEXTO}>
        {`Si ${correo} está registrado, te enviamos un token (el correo indica su vigencia). Revisa también la carpeta de spam. ${AVISO_RECUPERACION_SIN_CONFIRMAR}`}
      </p>
      {/* `key`: otro correo empieza sin la espera del anterior. Sin `recienEnviado`: la recuperación no envía enlace de confirmación. */}
      <ReenviarConfirmacion key={correo} email={correo} id="reenvio-recuperacion" />
    </div>
  );
}

function PasoToken({
  enviando,
  onEnviar,
  onVolver,
}: {
  enviando: boolean;
  onEnviar: (token: string, password: string, confirmacion: string) => void;
  onVolver: () => void;
}) {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar(token, password, confirmacion);
      }}
    >
      <Campo
        id="token"
        etiqueta="Token"
        autoComplete="one-time-code"
        required
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      <Campo
        id="nuevaPassword"
        etiqueta={`Contraseña nueva (${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres)`}
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Campo
        id="confirmacion"
        etiqueta="Repite la contraseña nueva"
        type="password"
        autoComplete="new-password"
        required
        value={confirmacion}
        onChange={(e) => setConfirmacion(e.target.value)}
      />
      <Boton cargando={enviando}>Cambiar contraseña</Boton>
      <button type="button" onClick={onVolver} className={`${ENLACE} self-start text-sm`}>
        Pedir otro token
      </button>
    </form>
  );
}
