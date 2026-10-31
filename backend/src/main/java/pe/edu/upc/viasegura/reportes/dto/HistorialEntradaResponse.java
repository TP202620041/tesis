package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;

/**
 * Una entrada de la linea de tiempo de un reporte (US-22).
 *
 * <p>Cubre cambios de estado (US-14), asignaciones de responsable (US-15) y,
 * desde NC-11a, las acciones de moderacion del ADMIN ({@code FOTO_OCULTA},
 * {@code REPORTE_OCULTO}, {@code FOTO_RESTABLECIDA},
 * {@code REPORTE_RESTABLECIDO}). La vista varia por quien la pide (ver
 * {@code SeguimientoReporteService}): el ciudadano ve las asignaciones como un
 * hito redactado; en la moderacion, el adherido ve un texto fijo en lugar del
 * motivo, y el autor real solo lo ve el ADMIN (los demas, «Moderación de
 * Ciudad Viva»).</p>
 *
 * @param avisoIndice texto fijo del servidor sobre el indice de desempeno, solo
 *                    en {@code REPORTE_OCULTO} y {@code REPORTE_RESTABLECIDO};
 *                    {@code null} en el resto. Lo arma el servidor, no el ADMIN.
 */
public record HistorialEntradaResponse(
        Long id,
        String tipoEvento,
        String estadoAnterior,
        String estadoNuevo,
        String comentario,
        String autor,
        Instant fecha,
        String avisoIndice
) {}
