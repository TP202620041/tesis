'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { useIniciarSesion } from '../hooks/useIniciarSesion';
import { destinoTrasAcceso } from '../model/rutas';

/** US-02: inicio de sesion para ciudadano y funcionario municipal. */
export function FormularioLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enviando, error, enviar } = useIniciarSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function alEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    const sesion = await enviar({ email, password });
    if (!sesion) return;
    // Si llego aqui por un 401 o por la guardia de rol, se le devuelve a
    // donde estaba; si no, a la puerta de entrada de su rol (el funcionario
    // a su bandeja, el ciudadano a sus reportes). Con los terminos vigentes
    // sin aceptar (NC-07b), antes la pantalla de aceptacion. La misma regla
    // usa el registro.
    router.push(destinoTrasAcceso(sesion.usuario, searchParams.get('redirect')));
    router.refresh();
  }

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-4" noValidate>
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
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
  );
}
