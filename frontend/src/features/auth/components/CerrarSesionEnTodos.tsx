'use client';

import { useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { Dialogo } from '@/components/ui/dialogo';
import { AlertaError, Boton } from '@/components/ui/form';
import { Icono } from '@/components/ui/Icono';
import { useCerrarSesionEnTodosLosDispositivos } from '../hooks/useCerrarSesion';

/**
 * US-04 Esc. 2: «Cerrar sesión en todos los dispositivos», con confirmación.
 *
 * Pide confirmar porque no se deshace: cierra también la sesión de este
 * dispositivo y de cualquier otro (teléfono, computadora prestada) donde se
 * haya entrado. Tras el 204 del servidor sigue el cierre local de siempre.
 * Si el servidor falla, el error se muestra en el diálogo y la sesión sigue.
 */
export function CerrarSesionEnTodos() {
  const [abierto, setAbierto] = useState(false);
  const { cerrar, enviando, error } = useCerrarSesionEnTodosLosDispositivos();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAbierto(true)}
        className="flex min-h-objetivo w-full items-center gap-3 rounded-control px-3 text-left font-semibold text-texto hover:bg-superficie-2"
      >
        <Icono icono={MonitorSmartphone} tamano={18} />
        Cerrar sesión en todos los dispositivos
      </button>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="¿Cerrar sesión en todos los dispositivos?"
      >
        <div className="flex flex-col gap-4 text-sm text-texto">
          <p>
            Se cerrará tu sesión en este dispositivo y en todos los demás donde hayas entrado.
            Tendrás que volver a iniciar sesión en cada uno.
          </p>
          <p className="text-texto-2">
            Úsalo si perdiste un teléfono o entraste desde una computadora ajena.
          </p>
          {error && <AlertaError mensaje={error.mensaje} detalles={error.detalles} />}
          <div className="flex flex-wrap gap-2">
            <Boton type="button" variante="peligro" cargando={enviando} onClick={cerrar}>
              Cerrar todas las sesiones
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      </Dialogo>
    </>
  );
}
