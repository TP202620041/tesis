'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AlertaError, Boton } from '@/components/ui/form';
import type { Usuario } from '@/lib/types/domain';
import { useAceptarTerminos } from '../hooks/useAceptarTerminos';
import {
  etiquetaDeFinalidad,
  TEXTO_DE_FINALIDAD,
  type FinalidadOpcional,
} from '../model/consentimientos';
import { destinoInterno, rutaInicialDe } from '../model/rutas';
import { VERSION_TERMINOS } from '../model/terminos';
import { BotonCerrarSesion } from './BotonCerrarSesion';
import { clasesDeBoton } from '@/components/ui/Boton';

interface Props {
  usuario: Usuario;
  /** El texto legal a leer (lo compone la pagina: es de la feature `legal`). */
  texto: ReactNode;
}

/**
 * NC-07b (D-12): pantalla de aceptacion para quien tiene
 * `debeAceptarTerminos` (cuentas anteriores a los terminos, o tras publicar
 * una version nueva). Bloquea hasta aceptar: el backend responde 403
 * `TERMINOS_PENDIENTES` a todo lo demas. Ofrece, opcionales, los avisos por
 * correo y push (solo el consentimiento; activar push en el navegador se
 * hace desde el perfil). Al terminar vuelve a `?redirect=`.
 *
 * Los avisos opcionales solo se ofrecen al ciudadano: son avisos sobre SUS
 * reportes, y el funcionario y el admin no reciben ninguno.
 */
export function AceptarTerminos({ usuario, texto }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destino = destinoInterno(searchParams.get('redirect'), rutaInicialDe(usuario.rol));
  const { carga, version, enviando, error, aceptar } = useAceptarTerminos();
  const [acepta, setAcepta] = useState(false);
  const [opcionales, setOpcionales] = useState<FinalidadOpcional[]>([]);
  const [fallidos, setFallidos] = useState<FinalidadOpcional[] | null>(null);
  const ofreceAvisos = usuario.rol === 'CIUDADANO';
  const yaAceptados = carga.datos?.debeAceptarTerminos === false;

  // Quien ya acepto la version vigente no tiene nada que hacer aqui.
  useEffect(() => {
    if (yaAceptados && fallidos === null) router.replace(destino);
  }, [yaAceptados, fallidos, router, destino]);

  if (carga.estado === 'cargando' || yaAceptados) {
    return <p className="p-8 text-texto-2">Cargando…</p>;
  }
  if (carga.estado === 'error') {
    return (
      <Marco>
        <AlertaError mensaje={carga.error.mensaje} detalles={carga.error.detalles} />
        <button
          type="button"
          onClick={carga.recargar}
          className={`${clasesDeBoton('secundario', 'compacto')} self-start`}
        >
          Reintentar
        </button>
      </Marco>
    );
  }

  // La version vigente del servidor no es la del texto que esta app trae: no
  // se puede aceptar un texto que no se mostro.
  const textoDesactualizado = version !== VERSION_TERMINOS;

  if (fallidos !== null) {
    return (
      <Marco>
        <p className="border border-exito-borde rounded-control bg-exito-fondo px-3 py-2 text-sm text-exito-texto">
          Aceptaste los términos de uso y la política de privacidad.
        </p>
        <AlertaError
          mensaje={`No se pudo guardar: ${fallidos.map(etiquetaDeFinalidad).join(' y ')}. Puedes activarlo después desde tu perfil.`}
        />
        <button
          type="button"
          onClick={() => router.replace(destino)}
          className={`${clasesDeBoton('primario')} self-start`}
        >
          Continuar
        </button>
      </Marco>
    );
  }

  function alternar(finalidad: FinalidadOpcional, marcado: boolean) {
    setOpcionales((previos) =>
      marcado ? [...previos.filter((f) => f !== finalidad), finalidad] : previos.filter((f) => f !== finalidad),
    );
  }

  async function alEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!acepta || textoDesactualizado) return;
    const resultado = await aceptar(opcionales);
    if (!resultado) return;
    if (resultado.avisosFallidos.length > 0) setFallidos(resultado.avisosFallidos);
    else router.replace(destino);
  }

  return (
    <Marco>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-texto">
          Términos de uso y privacidad
        </h1>
        <p className="text-sm text-texto-2">
          Para seguir usando Ciudad Viva, {usuario.nombre}, necesitamos que leas y aceptes la versión{' '}
          <code className="font-mono">{version}</code> de los términos de uso y la política de
          privacidad.
        </p>
      </header>

      <div className="max-h-[50vh] overflow-y-auto rounded-control border border-linea p-4">
        {texto}
      </div>

      {textoDesactualizado && (
        <AlertaError
          // Sin «escríbenos desde Soporte»: Soporte también está bloqueado
          // mientras falten los términos.
          mensaje={`La versión vigente (${version}) todavía no está disponible en esta versión de la aplicación. La aplicación se está actualizando; vuelve a intentarlo en unos minutos.`}
        />
      )}
      {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}

      <form onSubmit={alEnviar} className="flex flex-col gap-4" noValidate>
        <label className="flex items-start gap-2 text-sm font-medium text-texto">
          <input
            type="checkbox"
            required
            checked={acepta}
            disabled={textoDesactualizado}
            onChange={(e) => setAcepta(e.target.checked)}
            className="mt-0.5"
          />
          <span>Acepto los términos de uso y la política de privacidad (obligatorio)</span>
        </label>

        {ofreceAvisos && (
          <fieldset className="flex flex-col gap-2 rounded-control border border-linea p-3">
            <legend className="px-1 text-sm font-semibold text-texto">
              Avisos sobre tus reportes (opcionales)
            </legend>
            {(['NOTIFICACIONES_CORREO', 'NOTIFICACIONES_PUSH'] as const).map((finalidad) => (
              <label key={finalidad} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={opcionales.includes(finalidad)}
                  onChange={(e) => alternar(finalidad, e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-texto">
                    {etiquetaDeFinalidad(finalidad)}.
                  </span>{' '}
                  <span className="text-texto-2">{TEXTO_DE_FINALIDAD[finalidad]}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-texto-2">
              Puedes cambiarlos cuando quieras desde tu perfil. Para recibir push, además tendrás
              que activarlas en este navegador desde tu perfil.
            </p>
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Boton cargando={enviando} disabled={!acepta || textoDesactualizado}>
            Aceptar y continuar
          </Boton>
          <BotonCerrarSesion />
        </div>
      </form>
    </Marco>
  );
}

function Marco({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">{children}</main>;
}
