'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Aviso } from '@/components/ui/Aviso';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useIniciarSesion } from '../hooks/useIniciarSesion';
import { destinoTrasAcceso } from '../model/rutas';
import { ReenviarConfirmacion } from './ReenviarConfirmacion';

/**
 * US-02: inicio de sesion para ciudadano y funcionario municipal.
 *
 * NC-09: si la cuenta aun no confirmo su correo (409 `CORREO_NO_CONFIRMADO`),
 * se muestra el mensaje del backend y «Reenviar el enlace» al correo con el
 * que se intento entrar. Va FUERA del `<form>` del login porque tiene su
 * propio formulario (no se pueden anidar).
 */
export function FormularioLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enviando, error, correoSinConfirmar, enviar } = useIniciarSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function alEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    const sesion = await enviar({ email, password });
    if (!sesion) return;
    // Si llego aqui por un 401 o por la guardia de rol, se le devuelve a
    // donde estaba; si no, a la puerta de entrada de su rol (el funcionario
    // a su bandeja, el ciudadano a sus reportes). Con los terminos vigentes
    // sin aceptar (NC-07b), antes la pantalla de aceptacion.
    router.push(destinoTrasAcceso(sesion.usuario, searchParams.get('redirect')));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && correoSinConfirmar && (
        <div className="flex flex-col gap-3">
          <Aviso tono="advertencia" titulo="Falta confirmar tu correo" rol="alert">
            <p>{error.mensaje}</p>
          </Aviso>
          {/* `key`: otro correo sin confirmar empieza sin la espera del anterior. */}
          <ReenviarConfirmacion key={correoSinConfirmar} email={correoSinConfirmar} id="reenvio-login" />
        </div>
      )}
      <form onSubmit={alEnviar} className="flex flex-col gap-4" noValidate>
        {error && !correoSinConfirmar && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
        <Campo
          id="email"
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          id="password"
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Boton cargando={enviando}>Iniciar sesión</Boton>
      </form>
    </div>
  );
}
