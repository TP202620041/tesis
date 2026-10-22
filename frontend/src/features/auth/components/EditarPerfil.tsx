'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { AlertaError, Boton, Campo } from '@/components/ui/form';
import { PREFERENCIAS_NOTIFICACION, type PreferenciaNotificacion, type Usuario } from '@/lib/types/domain';
import { useConsentimientos } from '../hooks/useConsentimientos';
import { useDistritosDeResidencia, usePerfil } from '../hooks/usePerfil';
import { usePushEnEsteNavegador } from '../hooks/usePushEnEsteNavegador';
import { FotoDePerfil } from './FotoDePerfil';
import { PrivacidadYConsentimientos } from './PrivacidadYConsentimientos';
import { PushEnEsteNavegador } from './PushEnEsteNavegador';
import { SelectorDeApariencia } from './SelectorDeApariencia';

/**
 * US-30: el ciudadano edita sus datos, su foto y como quiere recibir avisos.
 * NC-07b: y revisa sus consentimientos (`textoLegal`: ver
 * {@link PrivacidadYConsentimientos}).
 */
export function EditarPerfil({ inicial, textoLegal }: { inicial: Usuario; textoLegal: ReactNode }) {
  const { usuario, guardando, guardado, error, guardar, cambiarPreferencia } = usePerfil(inicial);
  const distritos = useDistritosDeResidencia();
  const consentimientos = useConsentimientos();
  const push = usePushEnEsteNavegador(consentimientos);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [apellido, setApellido] = useState(inicial.apellido);
  const [distritoId, setDistritoId] = useState<number | null>(inicial.distritoId ?? null);
  const [foto, setFoto] = useState<File | null>(null);

  async function alEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    const ok = await guardar({ nombre, apellido, distritoId, foto });
    // La foto ya está en el servidor: se limpia para no reenviarla.
    if (ok) setFoto(null);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6">
      <Link href="/mis-reportes" className="self-start text-sm text-sky-700 hover:underline dark:text-sky-400">
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

      <form onSubmit={alEnviar} className="flex flex-col gap-4" noValidate>
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
        {/* NC-07b: la preferencia elige el canal; el permiso es el consentimiento. */}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Esto es solo tu preferencia. Para recibir avisos también necesitas otorgar el
          consentimiento de ese canal en «Privacidad y consentimientos» y, para push, activarlas en
          cada navegador. Si un push no llega, el aviso cae a correo solo si diste ese
          consentimiento.
        </p>
      </section>

      {/* US-23: también está en el menú de cuenta; aquí, con la descripción. */}
      <section className="border-t border-slate-200 pt-4 dark:border-slate-700">
        <SelectorDeApariencia />
      </section>

      <PrivacidadYConsentimientos
        consentimientos={consentimientos}
        textoLegal={textoLegal}
        revocar={(finalidad) =>
          finalidad === 'NOTIFICACIONES_PUSH'
            ? push.retirarConsentimiento()
            : consentimientos.revocar(finalidad)
        }
        extra={{ NOTIFICACIONES_PUSH: <PushEnEsteNavegador push={push} /> }}
      />
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
