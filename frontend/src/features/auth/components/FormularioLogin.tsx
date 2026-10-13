'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { iniciarSesion } from '@/features/auth/api';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { ApiError, NetworkError } from '@/lib/api/client';
import { rutaInicialDe } from '../model/rutas';

/** US-02: inicio de sesion para ciudadano y funcionario municipal. */
export function FormularioLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ mensaje: string; detalles: string[] } | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const sesion = await iniciarSesion({ email, password });
      // Si llego aqui por un 401 o por la guardia de rol, se le devuelve a
      // donde estaba; si no, a la puerta de entrada de su rol (el funcionario
      // a su bandeja, el ciudadano al mapa).
      const redirect = searchParams.get('redirect');
      router.push(redirect ?? rutaInicialDe(sesion.usuario.rol));
      router.refresh();
    } catch (e) {
      if (e instanceof NetworkError) {
        setError({ mensaje: 'Sin conexión con el servidor. Revisa tu red.', detalles: [] });
      } else if (e instanceof ApiError) {
        // El backend responde 401 con "Credenciales invalidas" ante email
        // inexistente o password incorrecta: no distingue cual de los dos,
        // para no revelar que cuentas existen.
        setError({ mensaje: e.message, detalles: e.details });
      } else {
        setError({ mensaje: 'Ocurrió un error inesperado.', detalles: [] });
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
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
      <Boton cargando={cargando}>Iniciar sesión</Boton>
    </form>
  );
}
