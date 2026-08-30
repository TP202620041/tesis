package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.Size;

/**
 * Edicion parcial de un reporte PENDIENTE (US-08). Ambos campos son
 * opcionales: {@code null} significa "no cambiar ese campo" (no un PATCH
 * merge JSON-estandar, sino un reemplazo simple por campo presente).
 */
public record EditarReporteRequest(
        Long categoriaId,
        @Size(max = 1000) String descripcion
) {}
