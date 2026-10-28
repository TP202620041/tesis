'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { clasesDeBoton } from '@/components/ui/Boton';
import type { CuentaPorConfirmar } from '@/lib/types/domain';
import { textoDeHoras } from '../model/confirmacion';
import { ReenviarConfirmacion } from './ReenviarConfirmacion';

/**
 * NC-09: lo que ve quien acaba de crear la cuenta. No hay sesión: la cuenta
 * se usa después de abrir el enlace del correo. El correo es el de la
 * respuesta del backend (ya normalizado), no el que se escribió.
 *
 * El foco pasa al título al aparecer: el formulario que tenía el foco se
 * desmonta, y así el lector de pantalla lee el resultado en vez de quedar
 * en el vacío.
 */
export function RegistroEnviado({ cuenta, rutaLogin }: { cuenta: CuentaPorConfirmar; rutaLogin: string }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  return (
    <section aria-labelledby="registro-enviado-titulo" className="flex flex-col gap-4">
      <h2
        id="registro-enviado-titulo"
        ref={titulo}
        tabIndex={-1}
        className="text-lg font-semibold text-texto"
      >
        Revisa tu correo
      </h2>
      <p className="text-sm text-texto">
        Te enviamos un enlace a <strong className="break-all">{cuenta.email}</strong> para confirmar tu cuenta.
        Vence en {textoDeHoras(cuenta.vigenciaEnlaceHoras)}. Si no lo ves, revisa la carpeta de spam.
      </p>
      <ReenviarConfirmacion email={cuenta.email} recienEnviado id="reenvio-registro" />
      <Link href={rutaLogin} className={clasesDeBoton('primario')}>
        Ir a iniciar sesión
      </Link>
    </section>
  );
}
