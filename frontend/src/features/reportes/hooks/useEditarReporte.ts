'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { cancelarReporte, editarReporte } from '../api';
import {
  cambiosDeEdicion,
  errorDeEdicion,
  opcionesDeCategoria,
  type EdicionElegida,
} from '../model/edicion';
import type { ReporteResumen } from '../model/tipos';
import { useCategoriasDeReporte } from './useCategoriasDeReporte';

/**
 * US-08: el creador edita o retira su reporte mientras sigue PENDIENTE
 * (NC-02: tambien su titulo y su severidad).
 *
 * El backend valida igual y responde 403 (no eres el creador) o 409 (ya no
 * esta PENDIENTE) si algo cambio mientras la pantalla estaba abierta; los
 * dos llegan con su mensaje en `error`. `guardar` y `retirar` devuelven
 * `true` si el backend acepto el cambio.
 */
export function useEditarReporte(reporte: ReporteResumen) {
  // Categorias validas para el distrito del reporte (US-29).
  const categorias = useCategoriasDeReporte(reporte.distritoId ?? null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const reporteId = reporte.id ?? 0;
  const categoriaOriginal = reporte.categoriaId ?? null;
  const tituloOriginal = reporte.titulo ?? null;
  const severidadOriginal = reporte.severidad ?? null;

  // Una categoria desactivada (US-29) ya no viene en el catalogo, pero sigue
  // siendo la del reporte: se ofrece igual, marcada.
  const opciones = opcionesDeCategoria(categorias, {
    id: categoriaOriginal,
    nombre: reporte.categoriaNombre ?? null,
  });

  const ejecutar = useCallback(async (accion: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    setEnviando(true);
    try {
      await accion();
      return true;
    } catch (e) {
      setError(mensajeDeError(e));
      return false;
    } finally {
      setEnviando(false);
    }
  }, []);

  /**
   * US-29: la categoria solo se reenvia si cambio (puede estar desactivada;
   * el backend lo acepta, pero no hace falta). NC-02: titulo y severidad,
   * igual; un titulo cambiado se valida antes de enviarlo (el backend
   * responderia 400).
   */
  const guardar = useCallback(
    async (elegido: EdicionElegida): Promise<boolean> => {
      const cambios = cambiosDeEdicion(
        { categoriaId: categoriaOriginal, titulo: tituloOriginal, severidad: severidadOriginal },
        elegido,
      );
      const invalido = errorDeEdicion(cambios);
      if (invalido) {
        setError({ mensaje: invalido, detalles: [] });
        return false;
      }
      return ejecutar(() => editarReporte(reporteId, cambios));
    },
    [ejecutar, reporteId, categoriaOriginal, tituloOriginal, severidadOriginal],
  );

  /** Pasa el reporte a CANCELADO, tambien para los vecinos adheridos. */
  const retirar = useCallback(
    () => ejecutar(() => cancelarReporte(reporteId)),
    [ejecutar, reporteId],
  );

  return { opciones, guardar, retirar, enviando, error };
}
