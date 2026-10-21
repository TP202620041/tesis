package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.Size;
import pe.edu.upc.viasegura.reportes.domain.Severidad;

/**
 * Edicion parcial de un reporte PENDIENTE (US-08). Todos los campos son
 * opcionales: {@code null} significa "no cambiar ese campo" (no un PATCH
 * merge JSON-estandar, sino un reemplazo simple por campo presente).
 *
 * @param titulo    si llega, 5-120 caracteres tras el trim (NC-02).
 * @param severidad si llega, BAJA | MEDIA | ALTA (NC-02).
 */
public record EditarReporteRequest(
        Long categoriaId,
        String titulo,
        @Size(max = 1000) String descripcion,
        Severidad severidad
) {}
