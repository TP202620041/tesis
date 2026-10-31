package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.Size;

/**
 * El ADMIN desestima las denuncias pendientes de un reporte (NC-11a).
 *
 * @param motivo opcional, hasta 500 caracteres; solo lo leen los DTO del ADMIN
 */
public record DesestimarDenunciasRequest(
        @Size(max = 500, message = "El motivo puede tener como máximo {max} caracteres")
        String motivo
) {}
