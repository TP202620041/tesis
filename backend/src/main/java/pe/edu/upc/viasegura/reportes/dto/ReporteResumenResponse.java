package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.reportes.domain.Reporte;

/**
 * Representacion resumida de un reporte para la bandeja municipal y el
 * resultado de un cambio de estado (US-13, US-14).
 */
public record ReporteResumenResponse(
        Long id,
        double latitud,
        double longitud,
        String fotoUrl,
        String descripcion,
        Long categoriaId,
        String categoriaNombre,
        String estado,
        Long distritoId,
        String distritoNombre,
        int totalAdhesiones,
        Instant createdAt,
        Instant resolvedAt,
        boolean posibleReincidencia
) {
    public static ReporteResumenResponse from(Reporte r) {
        return new ReporteResumenResponse(
                r.getId(),
                r.getUbicacion().getY(),
                r.getUbicacion().getX(),
                r.getFotoUrl(),
                r.getDescripcion(),
                r.getCategoria().getId(),
                r.getCategoria().getNombre(),
                r.getEstado().name(),
                r.getDistrito() != null ? r.getDistrito().getId() : null,
                r.getDistrito() != null ? r.getDistrito().getNombre() : null,
                r.getTotalAdhesiones(),
                r.getCreatedAt(),
                r.getResolvedAt(),
                r.isPosibleReincidencia());
    }
}
