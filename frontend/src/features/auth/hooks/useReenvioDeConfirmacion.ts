'use client';

import { useCallback, useEffect, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { reenviarConfirmacion } from '../api';
import { segundosParaReenviar } from '../model/confirmacion';

interface OpcionesReenvio {
  /**
   * `true` si el enlace acaba de salir (la pantalla «Revisa tu correo» tras
   * registrarse): el primer reenvío también espera 60 s, porque el del
   * registro cuenta para el tope del backend.
   */
  recienEnviado?: boolean;
}

/**
 * NC-09: pedir otro enlace de confirmación sin sesión.
 *
 * El backend responde 202 en todos los casos (cuenta inexistente, ya
 * confirmada, tope alcanzado o enviado), así que tras un 202 la pantalla
 * muestra siempre el mismo mensaje neutro y deshabilita el botón 60 s: la
 * respuesta no dice si de verdad salió un correo, y un pedido antes de ese
 * plazo no enviaría nada. Solo falla por validación (400) o por red.
 */
export function useReenvioDeConfirmacion({ recienEnviado = false }: OpcionesReenvio = {}) {
  // `ultimoEnvio` y `ahora` en ms. `ahora` lo avanza un intervalo solo
  // mientras hay espera, para que el contador se vea bajar.
  const [ultimoEnvio, setUltimoEnvio] = useState<number | null>(() => (recienEnviado ? Date.now() : null));
  const [ahora, setAhora] = useState(() => Date.now());
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const segundosRestantes = segundosParaReenviar(ultimoEnvio, ahora);
  const enEspera = segundosRestantes > 0;

  useEffect(() => {
    if (!enEspera) return;
    const intervalo = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, [enEspera]);

  const reenviar = useCallback(
    async (email: string): Promise<boolean> => {
      if (enEspera || enviando) return false;
      const correo = email.trim();
      setError(null);
      setEnviado(false);
      if (!correo) {
        setError({ mensaje: 'Escribe el correo con el que creaste la cuenta.', detalles: [] });
        return false;
      }
      setEnviando(true);
      try {
        await reenviarConfirmacion(correo);
        // Los dos a la vez: con `ahora` viejo, la espera saldria de mas.
        const momento = Date.now();
        setUltimoEnvio(momento);
        setAhora(momento);
        setEnviado(true);
        return true;
      } catch (e) {
        setError(mensajeDeError(e));
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [enEspera, enviando],
  );

  return { enviando, enviado, error, segundosRestantes, reenviar };
}
