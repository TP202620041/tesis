package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;

/**
 * Una entrada de la linea de tiempo de gestion de un reporte (US-22).
 *
 * <p>Cubre tanto cambios de estado (US-14) como asignaciones de responsable
 * (US-15). La vista varia por rol: el ciudadano ve las asignaciones como un
 * hito redactado (sin nombre de cuadrilla ni autor); el funcionario del
 * distrito y el admin ven el detalle interno completo.</p>
 */
public record HistorialEntradaResponse(
        Long id,
        String tipoEvento,
        String estadoAnterior,
        String estadoNuevo,
        String comentario,
        String autor,
        Instant fecha
) {}
