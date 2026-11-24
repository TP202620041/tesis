'use client';

import { useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { Aviso } from '@/components/ui/Aviso';
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
 *
 * Si el servidor falla, el error se muestra en el diálogo y la sesión sigue.
 * Como las notificaciones de este dispositivo ya se habían dado de baja, se
 * dice qué pasó con ellas: se restablecieron solas o quedaron desactivadas,
 * y entonces se ofrece «Volver a activar las notificaciones».
 */
export function CerrarSesionEnTodos() {
  const [abierto, setAbierto] = useState(false);
  const {
    cerrar,
    enviando,
    error,
    pushTrasFallo,
    reactivarPush,
    reactivando,
    reactivacionFallida,
  } = useCerrarSesionEnTodosLosDispositivos();

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
          {error && (
            <AlertaError
              mensaje={error.mensaje}
              detalles={[...error.detalles, 'Tu sesión sigue abierta; puedes volver a intentarlo.']}
            />
          )}
          {/* Región viva siempre montada: se anuncia el texto que aparece dentro. */}
          <div role="status">
            {error && pushTrasFallo === 'restablecido' && (
              <p className="text-texto-2">Las notificaciones de este dispositivo siguen activas.</p>
            )}
            {error && pushTrasFallo === 'desactivado' && (
              <Aviso tono="advertencia" titulo="Notificaciones desactivadas en este dispositivo">
                <p>
                  Al intentar cerrar las sesiones se desactivaron las notificaciones de este
                  dispositivo y no se pudieron restablecer solas.
                </p>
                {reactivacionFallida && (
                  <p>
                    No se pudieron reactivar. Puedes intentarlo desde «Notificaciones push»,
                    en «Privacidad y consentimientos» de tu perfil.
                  </p>
                )}
                <div className="mt-2">
                  <Boton
                    type="button"
                    variante="secundario"
                    tamano="compacto"
                    cargando={reactivando}
                    onClick={() => void reactivarPush()}
                  >
                    Volver a activar las notificaciones
                  </Boton>
                </div>
              </Aviso>
            )}
          </div>
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
