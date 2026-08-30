package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.reportes.domain.Reporte;

/**
 * Representacion publica de un reporte (US-05, US-09).
 *
 * @param esAdhesion true si el ciudadano se adhirio a un reporte existente
 *                   (duplicado acumulado, US-09); false si se creo un
 *                   reporte nuevo.
 */
public record ReporteResponse(
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
        boolean esAdhesion,
        Instant createdAt
) {
    public static ReporteResponse from(Reporte r, boolean esAdhesion) {
        return new ReporteResponse(
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
                esAdhesion,
                r.getCreatedAt());
    }
}
