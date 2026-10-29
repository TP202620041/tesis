'use client';

import { useCallback, useRef, useState } from 'react';
import { ApiError, mensajeDeError, NetworkError, type MensajeDeError } from '@/lib/api/errors';
import type { Severidad } from '@/lib/types/domain';
import type { TextoRechazado } from '@/lib/types/moderacion';
import { crearReporte } from '../api';
import { rechazoAlCrear } from '../model/moderacion';
import { errorDelTitulo, MENSAJE_SIN_SEVERIDAD } from '../model/titulo';
import type { NuevoReporte, ReporteCreado } from '../model/tipos';
import { useEncolarReporte } from './useColaOffline';

/** Lo que el ciudadano llena en el formulario de US-05. */
export interface DatosDelReporte {
  ubicacion: { latitud: number; longitud: number; manual: boolean } | null;
  categoriaId: number | null;
  /** NC-02: obligatorio, 5-120 caracteres tras el trim. */
  titulo: string;
  /** NC-02: sin valor por defecto; `null` hasta que el ciudadano elige. */
  severidad: Severidad | null;
  descripcion: string;
  foto: File | null;
}

/**
 * Por qué un reporte quedó en la cola del dispositivo: no había conexión
 * (US-06) o el ciudadano eligió «Guardar para enviar después» porque no se
 * pudo revisar la foto (NC-10c). La pantalla de confirmación lo dice.
 */
export type MotivoDeEspera = 'sin-conexion' | 'moderacion-no-disponible';

/**
 * Desenlace de un envío: creado (201), guardado en el dispositivo, foto
 * rechazada por la moderación (NC-10c: el formulario la quita y conserva el
 * resto), o nada (el error queda en el estado del hook).
 */
export type DesenlaceDelEnvio =
  | { tipo: 'creado'; reporte: ReporteCreado }
  | { tipo: 'encolado'; motivo: MotivoDeEspera }
  | { tipo: 'foto-no-permitida' }
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
 *
 * NC-10c, la moderacion (NC-10b):
 * - 400 `FOTO_NO_PERMITIDA`: devuelve `foto-no-permitida`; el formulario
 *   quita la foto y conserva el resto. No hay error general.
 * - 400 `TEXTO_NO_PERMITIDO`: queda en `textoRechazado` (campo, mensaje y lo
 *   que se envio), para mostrarlo en su campo. Tampoco hay error general.
 * - 503 `MODERACION_NO_DISPONIBLE` (solo con foto): queda en
 *   `moderacionNoDisponible` (el mensaje) y el formulario ofrece
 *   {@link guardarParaDespues} o enviar sin foto (otro `enviar` con
 *   `foto: null`). Las dos salidas usan la MISMA clave: el backend no
 *   registra una clave si no creo nada, y el reporte sigue siendo el mismo
 *   intento.
 * Ninguno renueva la clave.
 */
export function useCrearReporte(usuarioId: number) {
  const encolar = useEncolarReporte(usuarioId);
  const clave = useRef<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);
  const [textoRechazado, setTextoRechazado] = useState<TextoRechazado | null>(null);
  const [moderacionNoDisponible, setModeracionNoDisponible] = useState<string | null>(null);

  const limpiar = useCallback(() => {
    setError(null);
    setTextoRechazado(null);
    setModeracionNoDisponible(null);
  }, []);

  /**
   * Valida lo que el backend rechazaria con 400 y arma la peticion con la
   * clave del intento, o deja el error y devuelve `null`.
   */
  const preparar = useCallback((datos: DatosDelReporte): NuevoReporte | null => {
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
    // NC-02: mismas reglas que el backend (que responderia 400).
    const errorTitulo = errorDelTitulo(datos.titulo);
    if (errorTitulo) {
      setError({ mensaje: errorTitulo, detalles: [] });
      return null;
    }
    if (datos.severidad == null) {
      setError({ mensaje: MENSAJE_SIN_SEVERIDAD, detalles: [] });
      return null;
    }

    clave.current ??= crypto.randomUUID();
    return {
      latitud: datos.ubicacion.latitud,
      longitud: datos.ubicacion.longitud,
      categoriaId: datos.categoriaId,
      titulo: datos.titulo.trim(),
      severidad: datos.severidad,
      descripcion: datos.descripcion,
      ubicacionManual: datos.ubicacion.manual,
      foto: datos.foto,
      idempotencyKey: clave.current,
    };
  }, []);

  /**
   * Guarda el reporte en la cola con su clave y la renueva. Si no hay
   * IndexedDB (algun modo privado), deja `mensajeSinCola` y conserva la clave.
   */
  const guardarEnCola = useCallback(
    async (
      nuevo: NuevoReporte,
      motivo: MotivoDeEspera,
      mensajeSinCola: string,
    ): Promise<DesenlaceDelEnvio> => {
      try {
        await encolar(nuevo);
        clave.current = null;
        return { tipo: 'encolado', motivo };
      } catch {
        setError({ mensaje: mensajeSinCola, detalles: [] });
        return null;
      }
    },
    [encolar],
  );

  const enviar = useCallback(
    async (datos: DatosDelReporte): Promise<DesenlaceDelEnvio> => {
      limpiar();
      const nuevo = preparar(datos);
      if (!nuevo) return null;

      setEnviando(true);
      try {
        const reporte = await crearReporte(nuevo);
        // Envio exitoso: el siguiente reporte es un intento logico distinto.
        clave.current = null;
        return { tipo: 'creado', reporte };
      } catch (e) {
        if (e instanceof NetworkError) {
          // US-06: se guarda con la MISMA clave; el reenvio automatico no
          // puede duplicarlo aunque esta peticion si hubiera llegado. Sin
          // IndexedDB se avisa y se conserva la clave, para que el
          // reintento manual siga siendo idempotente.
          return await guardarEnCola(
            nuevo,
            'sin-conexion',
            'Sin conexión. Tu reporte no se envió — vuelve a intentarlo cuando tengas señal.',
          );
        }
        // NC-10c: la moderacion, decidida por `codigo` (no por el texto).
        const rechazo =
          e instanceof ApiError
            ? rechazoAlCrear(e, { titulo: datos.titulo, descripcion: datos.descripcion })
            : null;
        if (rechazo?.tipo === 'foto-no-permitida') return { tipo: 'foto-no-permitida' };
        if (rechazo?.tipo === 'texto-no-permitido') {
          setTextoRechazado(rechazo.texto);
          return null;
        }
        if (rechazo?.tipo === 'moderacion-no-disponible' && nuevo.foto) {
          setModeracionNoDisponible(rechazo.mensaje);
          return null;
        }
        // 409 = fuera de cobertura o ya reportaste este daño (US-09); 400 =
        // validacion. El 403 `TERMINOS_PENDIENTES` lo resuelve el cliente.
        setError(mensajeDeError(e));
        return null;
      } finally {
        setEnviando(false);
      }
    },
    [guardarEnCola, limpiar, preparar],
  );

  /**
   * NC-10c: «Guardar para enviar después» tras el 503 de la moderacion. Va a
   * la cola de US-06 con la MISMA clave, sin otro POST: la cola reintenta
   * los 5xx sola (y el backend, que no registro la clave, lo crea entonces).
   * Lleva lo que el formulario tiene AHORA, por si el ciudadano cambio algo.
   */
  const guardarParaDespues = useCallback(
    async (datos: DatosDelReporte): Promise<DesenlaceDelEnvio> => {
      limpiar();
      const nuevo = preparar(datos);
      if (!nuevo) return null;
      setEnviando(true);
      try {
        return await guardarEnCola(
          nuevo,
          'moderacion-no-disponible',
          'No pudimos guardar el reporte en este dispositivo. Envíalo sin foto o vuelve a intentarlo en unos minutos.',
        );
      } finally {
        setEnviando(false);
      }
    },
    [guardarEnCola, limpiar, preparar],
  );

  /**
   * Borra el error de la operacion (y las salidas del 503). El formulario lo
   * llama cuando corta el envio por un error de campo, para que no conviva
   * el error viejo del backend con el del campo. El texto rechazado se queda:
   * sigue valiendo mientras el campo diga lo mismo.
   */
  const limpiarError = useCallback(() => {
    setError(null);
    setModeracionNoDisponible(null);
  }, []);

  return {
    enviar,
    guardarParaDespues,
    enviando,
    error,
    textoRechazado,
    moderacionNoDisponible,
    limpiarError,
  };
}
