'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { EnlaceConDialogo } from '@/components/ui/dialogo';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useRegistro } from '../hooks/useRegistro';
import { PASSWORD_MAX, PASSWORD_MIN } from '../model/password';
import { RUTA_PRIVACIDAD } from '../model/rutas';
import { TITULO_TERMINOS } from '../model/terminos';

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
 */
export function FormularioRegistro({ textoLegal }: { textoLegal: ReactNode }) {
  const router = useRouter();
  const { enviando, error, terminosDesactualizados, enviar } = useRegistro();
  const [campos, setCampos] = useState({ nombre: '', apellido: '', email: '', password: '' });
  const [acepta, setAcepta] = useState(false);
  const [faltaAceptar, setFaltaAceptar] = useState(false);

  function actualizar(clave: keyof typeof campos) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setCampos((previos) => ({ ...previos, [clave]: e.target.value }));
  }

  async function alEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!acepta) {
      setFaltaAceptar(true);
      return;
    }
    const sesion = await enviar(campos);
    if (sesion) {
      router.push('/sesion');
      router.refresh();
    } else {
      // Si el texto quedo viejo, la aceptacion ya no vale: debe releerlo.
      setAcepta(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-4" noValidate>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
      {terminosDesactualizados && (
        <p
          role="status"
          className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
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
        value={campos.password}
        onChange={actualizar('password')}
      />

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
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
              className="font-medium text-sky-700 hover:underline dark:text-sky-400"
            >
              términos de uso y la política de privacidad
            </EnlaceConDialogo>
          </span>
        </label>
        {faltaAceptar && !acepta && (
          <p id="acepta-terminos-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            Para crear la cuenta debes aceptar los términos de uso y la política de privacidad.
          </p>
        )}
      </div>

      <Boton cargando={enviando}>Crear cuenta</Boton>
    </form>
  );
}
