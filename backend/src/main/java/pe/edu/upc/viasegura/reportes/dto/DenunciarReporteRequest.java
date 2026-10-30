package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pe.edu.upc.viasegura.reportes.domain.MotivoDenuncia;

/**
 * Denuncia de un ciudadano sobre un reporte publico (NC-11a).
 *
 * @param motivo  {@code CONTENIDO_SEXUAL}, {@code OFENSIVO},
 *                {@code DATOS_PERSONALES}, {@code FALSO} u {@code OTRO}
 * @param detalle texto opcional de hasta 500 caracteres; solo lo lee el ADMIN
 */
public record DenunciarReporteRequest(
        @NotNull(message = "Elige el motivo de la denuncia")
        MotivoDenuncia motivo,
        @Size(max = 500, message = "El detalle puede tener como máximo {max} caracteres")
        String detalle
) {}
