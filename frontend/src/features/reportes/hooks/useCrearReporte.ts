'use client';

import { useCallback, useRef, useState } from 'react';
import { mensajeDeError, NetworkError, type MensajeDeError } from '@/lib/api/errors';
import { crearReporte } from '../api';
import type { NuevoReporte, ReporteCreado } from '../model/tipos';
import { useEncolarReporte } from './useColaOffline';

/** Lo que el ciudadano llena en el formulario de US-05. */
export interface DatosDelReporte {
  ubicacion: { latitud: number; longitud: number; manual: boolean } | null;
  categoriaId: number | null;
  descripcion: string;
  foto: File | null;
}

/** Desenlace de un envio: creado (201), guardado en el dispositivo, o nada. */
export type DesenlaceDelEnvio =
  | { tipo: 'creado'; reporte: ReporteCreado }
  | { tipo: 'encolado' }
  | null;

/**
 * US-05: crea el reporte. US-06: sin conexion lo guarda en el dispositivo.
 *
 * La `Idempotency-Key` vive aqui y es del INTENTO, no de la peticion: se
 * genera una vez por formulario montado y solo se renueva cuando el reporte
 * quedo en manos de otro (creado por el backend o guardado en la cola). Asi,
 * si el ciudadano reintenta porque la respuesta no llego, el backend
 * reconoce que es el mismo reporte y devuelve la respuesta original en vez
 * de duplicarlo o rechazarlo con el 409 de acumulacion de US-09.
 */
export function useCrearReporte(usuarioId: number) {
  const encolar = useEncolarReporte(usuarioId);
  const clave = useRef<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const enviar = useCallback(
    async (datos: DatosDelReporte): Promise<DesenlaceDelEnvio> => {
      setError(null);
      // El backend responde 400 si faltan coordenadas; se evita el viaje.
      if (!datos.ubicacion) {
        setError({
          mensaje: 'Indica dónde está el daño: usa tu GPS o márcalo en el mapa.',
          detalles: [],
        });
        return null;
      }
      if (datos.categoriaId == null) {
        setError({ mensaje: 'Elige el tipo de daño.', detalles: [] });
        return null;
      }

      clave.current ??= crypto.randomUUID();
      const nuevo: NuevoReporte = {
        latitud: datos.ubicacion.latitud,
        longitud: datos.ubicacion.longitud,
        categoriaId: datos.categoriaId,
        descripcion: datos.descripcion,
        ubicacionManual: datos.ubicacion.manual,
        foto: datos.foto,
        idempotencyKey: clave.current,
      };

      setEnviando(true);
      try {
        const reporte = await crearReporte(nuevo);
        // Envio exitoso: el siguiente reporte es un intento logico distinto.
        clave.current = null;
        return { tipo: 'creado', reporte };
      } catch (e) {
        // 409 = fuera de cobertura o ya reportaste este daño (US-09); 400 =
        // validacion. El 403 `TERMINOS_PENDIENTES` lo resuelve el cliente.
        if (!(e instanceof NetworkError)) {
          setError(mensajeDeError(e));
          return null;
        }
        // US-06: se guarda con la MISMA clave; el reenvio automatico no puede
        // duplicarlo aunque esta peticion si hubiera llegado al backend.
        try {
          await encolar(nuevo);
          clave.current = null;
          return { tipo: 'encolado' };
        } catch {
          // Sin IndexedDB (p. ej. algun modo privado) no hay donde guardarlo:
          // se avisa y se conserva la clave para que el reintento manual
          // siga siendo idempotente.
          setError({
            mensaje:
              'Sin conexión. Tu reporte no se envió — vuelve a intentarlo cuando tengas señal.',
            detalles: [],
          });
          return null;
        }
      } finally {
        setEnviando(false);
      }
    },
    [encolar],
  );

  return { enviar, enviando, error };
}
