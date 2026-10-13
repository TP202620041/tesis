'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useRecuperarPassword } from '../hooks/useRecuperarPassword';
import { PASSWORD_MAX, PASSWORD_MIN } from '../model/password';

const ENLACE = 'font-medium text-sky-700 hover:underline dark:text-sky-400';
const TEXTO = 'text-sm text-slate-600 dark:text-slate-400';

/**
 * US-03: recuperar la contraseña en dos pasos (correo → token y contraseña
 * nueva) y volver al login.
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
          className="rounded-md bg-sky-600 px-4 py-2 text-center font-medium text-white hover:bg-sky-700"
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
        <PasoToken
          correo={correo}
          enviando={enviando}
          onEnviar={restablecer}
          onVolver={() => irAPaso('correo')}
        />
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

function PasoToken({
  correo,
  enviando,
  onEnviar,
  onVolver,
}: {
  correo: string | null;
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
      {/* No se confirma que la cuenta exista: el backend responde igual en ambos casos. */}
      <p role="status" className={TEXTO}>
        {correo
          ? `Si ${correo} está registrado, te enviamos un token (el correo indica su vigencia). Revisa también la carpeta de spam.`
          : 'Ingresa el token que recibiste por correo.'}
      </p>
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
