'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { GuardiaDeRol } from '@/features/auth/components/GuardiaDeRol';
import { FotoDePerfil } from '@/features/auth/components/FotoDePerfil';
import { actualizarPreferenciaNotificacion, editarPerfil } from '@/features/auth/api';
import { listarDistritos } from '@/features/distritos/api';
import { ApiError, NetworkError } from '@/lib/api/client';
import { PREFERENCIAS_NOTIFICACION, type Distrito, type PreferenciaNotificacion, type Usuario } from '@/lib/types/domain';

/** US-30: el ciudadano edita sus datos, su foto y como quiere recibir avisos. */
export default function PerfilPage() {
  return <GuardiaDeRol rolesPermitidos={['CIUDADANO']}>{(u) => <Perfil inicial={u} />}</GuardiaDeRol>;
}

function Perfil({ inicial }: { inicial: Usuario }) {
  const [usuario, setUsuario] = useState<Usuario>(inicial);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [apellido, setApellido] = useState(inicial.apellido);
  const [distritoId, setDistritoId] = useState<number | null>(inicial.distritoId ?? null);
  const [foto, setFoto] = useState<File | null>(null);
  const [distritos, setDistritos] = useState<Distrito[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<{ mensaje: string; detalles: string[] } | null>(null);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      const lista = await listarDistritos().catch(() => [] as Distrito[]);
      if (!cancelado) setDistritos(lista);
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  function manejarError(e: unknown) {
    if (e instanceof NetworkError) {
      setError({ mensaje: 'Sin conexión con el servidor.', detalles: [] });
    } else if (e instanceof ApiError) {
      setError({ mensaje: e.message, detalles: e.details });
    } else {
      setError({ mensaje: 'Ocurrió un error inesperado.', detalles: [] });
    }
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setGuardado(false);
    setGuardando(true);
    try {
      const actualizado = await editarPerfil({ nombre, apellido, distritoId, foto });
      setUsuario(actualizado);
      // La foto ya está en el servidor: se limpia para no reenviarla.
      setFoto(null);
      setGuardado(true);
    } catch (e) {
      manejarError(e);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarPreferencia(preferencia: PreferenciaNotificacion) {
    setError(null);
    try {
      // Endpoint aparte del resto del perfil: la preferencia se guarda al
      // instante, sin obligar a pulsar "Guardar cambios".
      const actualizado = await actualizarPreferenciaNotificacion(preferencia);
      setUsuario(actualizado);
    } catch (e) {
      manejarError(e);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6">
      <Link href="/mis-reportes" className="text-sm text-sky-700 hover:underline dark:text-sky-400">
        ← Volver a mis reportes
      </Link>

      <header className="flex items-center gap-4">
        <FotoDePerfil fotoUrl={usuario.fotoUrl} nombre={usuario.nombre} />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mi perfil</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{usuario.email}</p>
        </div>
      </header>

      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
      {guardado && (
        <p
          aria-live="polite"
          className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
        >
          Tus datos quedaron guardados.
        </p>
      )}

      <form onSubmit={guardar} className="flex flex-col gap-4" noValidate>
        <Campo
          id="nombre"
          etiqueta="Nombre"
          required
          maxLength={100}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Campo
          id="apellido"
          etiqueta="Apellido"
          required
          maxLength={100}
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="distrito" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Distrito donde vives
          </label>
          <select
            id="distrito"
            value={distritoId ?? ''}
            onChange={(e) => setDistritoId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="">Sin especificar</option>
            {distritos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
          {/* Aclaracion util: el distrito de residencia NO decide a que
              municipalidad va un reporte, eso lo define el GPS. */}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Es solo tu distrito de residencia. Tus reportes se asignan a la municipalidad del
            lugar donde ocurre el daño, según el GPS.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="foto" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Foto de perfil <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <input
            id="foto"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-700 dark:text-slate-300"
          />
          {foto && <p className="text-xs text-slate-500">Se subirá: {foto.name}</p>}
        </div>

        <Boton cargando={guardando}>Guardar cambios</Boton>
      </form>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          ¿Cómo quieres que te avisemos?
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Cuando cambie el estado de alguno de tus reportes.
        </p>
        <div className="flex flex-col gap-1.5">
          {PREFERENCIAS_NOTIFICACION.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="preferencia"
                checked={usuario.preferenciaNotificacion === p}
                onChange={() => void cambiarPreferencia(p)}
              />
              <span className="text-slate-700 dark:text-slate-200">{etiquetaPreferencia(p)}</span>
            </label>
          ))}
        </div>
        {/* Honestidad sobre el estado real del canal push. */}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Las notificaciones push todavía no están disponibles: por ahora todos los avisos llegan
          por correo.
        </p>
      </section>
    </main>
  );
}

function etiquetaPreferencia(p: PreferenciaNotificacion): string {
  switch (p) {
    case 'PUSH':
      return 'Solo notificaciones push';
    case 'EMAIL':
      return 'Solo correo electrónico';
    case 'AMBAS':
      return 'Push y correo';
  }
}
