'use client';

import { useState } from 'react';
import type { VarianteBoton } from '@/components/ui/Boton';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useReenvioDeConfirmacion } from '../hooks/useReenvioDeConfirmacion';
import { MENSAJE_REENVIO } from '../model/confirmacion';

interface ReenviarConfirmacionProps {
  /** Correo al que se reenvía. Sin él, la pantalla lo pide en un campo. */
  email?: string;
  /** `true` justo después de registrarse: el botón espera 60 s desde ya. */
  recienEnviado?: boolean;
  /** Prefijo de los ids, por si hay más de un formulario en la pantalla. */
  id?: string;
  variante?: VarianteBoton;
}

/**
 * NC-09: «Reenviar el enlace» de confirmación, sin sesión. Lo usan la
 * pantalla «Revisa tu correo» del registro, el login (409
 * `CORREO_NO_CONFIRMADO`) y `/confirmar-cuenta` con el enlace vencido,
 * reemplazado o inválido (ahí no se sabe el correo y se pide).
 *
 * - Tras pedirlo, siempre el mismo mensaje neutro, en una región
 *   `role="status"` que existe desde el inicio (si aparece junto con su
 *   texto, no todos los lectores la anuncian).
 * - Durante la espera de 60 s el botón queda con `aria-disabled` y no con
 *   `disabled`: así no pierde el foco justo después de usarlo, y su
 *   descripción dice cuánto falta. El hook ignora el clic mientras tanto.
 */
export function ReenviarConfirmacion({
  email,
  recienEnviado = false,
  id = 'reenvio',
  variante = 'secundario',
}: ReenviarConfirmacionProps) {
  const { enviando, enviado, error, segundosRestantes, reenviar } = useReenvioDeConfirmacion({ recienEnviado });
  const [correo, setCorreo] = useState('');
  const enEspera = segundosRestantes > 0;
  const idEspera = `${id}-espera`;

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        void reenviar(email ?? correo);
      }}
    >
      {email === undefined && (
        <Campo
          id={`${id}-correo`}
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="email"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
      )}
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
      <Boton
        variante={variante}
        cargando={enviando}
        aria-disabled={enEspera ? true : undefined}
        aria-describedby={enEspera ? idEspera : undefined}
      >
        Reenviar el enlace
      </Boton>
      {enEspera && (
        <p id={idEspera} className="text-sm text-texto-2">
          Podrás pedir otro enlace en {segundosRestantes} s.
        </p>
      )}
      {/* Sin `empty:hidden`: una región oculta (display: none) es como una que no existe. */}
      <p role="status" className="text-sm text-texto">
        {enviado ? MENSAJE_REENVIO : ''}
      </p>
    </form>
  );
}
