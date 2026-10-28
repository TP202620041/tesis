'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Aviso } from '@/components/ui/Aviso';
import { clasesDeBoton } from '@/components/ui/Boton';
import { Boton } from '@/components/ui/form';
import { useConfirmacionDeCorreo } from '../hooks/useConfirmacionDeCorreo';
import { permiteReenviar } from '../model/confirmacion';
import { RUTA_LOGIN } from '../model/rutas';
import { ReenviarConfirmacion } from './ReenviarConfirmacion';

const ENLACE = 'font-medium text-enlace hover:underline';

/**
 * NC-09: `/confirmar-cuenta?token=…`, a donde lleva el enlace del correo.
 *
 * Lee el token una vez, lo saca de la URL y confirma (todo en
 * `useConfirmacionDeCorreo`). El resultado se anuncia en una región
 * `role="status"` que existe desde el primer render, con «Confirmando…»
 * dentro, para que el cambio al resultado se lea. Las acciones (reenviar,
 * reintentar, ir al login) quedan fuera de la región.
 *
 * No inicia sesión: termina siempre en el login. Si hay una sesión abierta
 * da igual; la confirmación no la toca.
 */
export function ConfirmarCuenta() {
  const searchParams = useSearchParams();
  const { estado, mensaje, reintentar } = useConfirmacionDeCorreo(searchParams.get('token'));
  const confirmado = estado === 'confirmado';
  const ofrecerReenvio = permiteReenviar(estado);

  return (
    <div className="flex flex-col gap-4">
      <div role="status" className="flex flex-col gap-2">
        {estado === 'confirmando' && <p className="text-sm text-texto-2">Confirmando tu correo…</p>}
        {confirmado && (
          <Aviso tono="exito" titulo="¡Listo! Tu correo está confirmado">
            <p>Ya puedes iniciar sesión con tu correo y tu contraseña.</p>
          </Aviso>
        )}
        {ofrecerReenvio && (
          <Aviso tono="advertencia" titulo="No pudimos confirmar tu correo con este enlace">
            <p>{mensaje}</p>
          </Aviso>
        )}
        {estado === 'error' && (
          <Aviso tono="error" titulo="No pudimos confirmar tu correo">
            <p>{mensaje}</p>
          </Aviso>
        )}
      </div>

      {estado === 'error' && (
        <Boton type="button" variante="secundario" onClick={reintentar}>
          Volver a intentar
        </Boton>
      )}

      {ofrecerReenvio && (
        <section aria-labelledby="pedir-enlace-titulo" className="flex flex-col gap-3">
          <h2 id="pedir-enlace-titulo" className="text-base font-semibold text-texto">
            Pide un enlace nuevo
          </h2>
          <p className="text-sm text-texto-2">Escribe el correo con el que creaste la cuenta.</p>
          <ReenviarConfirmacion id="reenvio-confirmar" />
        </section>
      )}

      {confirmado && (
        <Link href={RUTA_LOGIN} className={clasesDeBoton('primario')}>
          Ir a iniciar sesión
        </Link>
      )}
      {estado !== 'confirmando' && !confirmado && (
        <p className="text-sm text-texto-2">
          <Link href={RUTA_LOGIN} className={ENLACE}>
            Volver a iniciar sesión
          </Link>
        </p>
      )}
    </div>
  );
}
