package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.reportes.domain.Reporte;

/**
 * Representacion resumida de un reporte para quien solo consulta: la
 * busqueda y el detalle publicos (US-10, US-12, US-27) y las vistas del
 * ciudadano (mis reportes, editar, cancelar, pendientes de calificar; US-07,
 * US-08, US-26).
 *
 * <p><b>No lleva senales internas</b> (detecciones, priorizacion, marcas
 * para la municipalidad): las lee cualquiera, incluso sin autenticarse.
 * La bandeja municipal usa {@link ReporteGestionResponse}, que agrega
 * {@code posibleReincidencia} (US-27). Ver SEC-02 en el README.</p>
 */
public record ReporteResumenResponse(
        Long id,
        double latitud,
        double longitud,
        String fotoUrl,
        String titulo,
        String descripcion,
        String severidad,
        Long categoriaId,
        String categoriaNombre,
        String estado,
        Long distritoId,
        String distritoNombre,
        int totalAdhesiones,
        Instant createdAt,
        Instant resolvedAt
) {
    public static ReporteResumenResponse from(Reporte r) {
        return new ReporteResumenResponse(
                r.getId(),
                r.getUbicacion().getY(),
                r.getUbicacion().getX(),
                r.getFotoUrl(),
                r.getTitulo(),
                r.getDescripcion(),
                r.getSeveridad() != null ? r.getSeveridad().name() : null,
                r.getCategoria().getId(),
                r.getCategoria().getNombre(),
                r.getEstado().name(),
                r.getDistrito() != null ? r.getDistrito().getId() : null,
                r.getDistrito() != null ? r.getDistrito().getNombre() : null,
                r.getTotalAdhesiones(),
                r.getCreatedAt(),
                r.getResolvedAt());
    }
}
