'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { registrar } from '@/features/auth/api';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { ApiError, NetworkError } from '@/lib/api/client';
import { PASSWORD_MAX, PASSWORD_MIN } from '../model/password';

/**
 * US-01: registro de cuenta ciudadana.
 *
 * El backend siempre crea rol CIUDADANO desde este endpoint (las cuentas de
 * funcionario las provisiona la municipalidad), por eso el formulario no
 * ofrece elegir rol.
 */
export function FormularioRegistro() {
  const router = useRouter();
  const [campos, setCampos] = useState({ nombre: '', apellido: '', email: '', password: '' });
  const [error, setError] = useState<{ mensaje: string; detalles: string[] } | null>(null);
  const [cargando, setCargando] = useState(false);

  function actualizar(clave: keyof typeof campos) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setCampos((previos) => ({ ...previos, [clave]: e.target.value }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await registrar(campos);
      router.push('/sesion');
      router.refresh();
    } catch (e) {
      if (e instanceof NetworkError) {
        setError({ mensaje: 'Sin conexión con el servidor. Revisa tu red.', detalles: [] });
      } else if (e instanceof ApiError) {
        // 409 = correo ya registrado; 400 = validacion (`details` trae el
        // detalle por campo que produce @Valid en el backend).
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
      <Boton cargando={cargando}>Crear cuenta</Boton>
    </form>
  );
}
