'use client';

import { useCallback, useState } from 'react';
import { mensajeDeError, type MensajeDeError } from '@/lib/api/errors';
import { exportarReportes } from '../api';
import type { FiltrosExportacion, FormatoExportacion } from '../model/exportacion';

/**
 * Guarda un `Blob` como archivo: enlace temporal a una URL `blob:` con
 * `download`, clic programático y liberación de la URL. Un `<a href>` directo
 * al API no sirve porque no enviaría el token.
 */
function guardarArchivo(contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.style.display = 'none';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Se libera en la siguiente vuelta del event loop: revocarla en el mismo
  // tick puede cancelar la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** US-28: exporta la bandeja con sus filtros activos y descarga el archivo. */
export function useExportarReportes() {
  const [exportando, setExportando] = useState<FormatoExportacion | null>(null);
  const [error, setError] = useState<MensajeDeError | null>(null);

  const exportar = useCallback(
    async (filtros: FiltrosExportacion, formato: FormatoExportacion) => {
      setError(null);
      setExportando(formato);
      try {
        const { contenido, nombreArchivo } = await exportarReportes(filtros, formato);
        guardarArchivo(contenido, nombreArchivo);
      } catch (e) {
        // 400 = sin reportes para esos filtros: el mensaje del backend lo dice.
        setError(mensajeDeError(e));
      } finally {
        setExportando(null);
      }
    },
    [],
  );

  return { exportar, exportando, error };
}
