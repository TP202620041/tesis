package pe.edu.upc.viasegura.desempeno.dto;

import java.time.LocalDate;

/**
 * Periodo de gestion municipal para el filtro del dashboard publico (NC-06).
 * Fechas inclusivas. {@code vigente}: contiene la fecha de hoy en hora de
 * Lima; la PWA lo usa como seleccion por defecto.
 */
public record PeriodoGestionResponse(
        Long id,
        LocalDate fechaInicio,
        LocalDate fechaFin,
        boolean vigente
) {}
