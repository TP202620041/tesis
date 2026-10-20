package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.reportes.domain.Reporte;

/**
 * Reporte visto por la municipalidad: la bandeja (US-13) y el resultado de
 * un cambio de estado (US-14). Solo lo devuelven endpoints del rol
 * FUNCIONARIO_MUNICIPAL, acotados a su jurisdiccion.
 *
 * <p>Son los mismos campos que {@link ReporteResumenResponse} (mismos
 * nombres, para no duplicar mapeos en el cliente) <b>mas las senales
 * internas</b> que dirigen la atencion municipal, hoy
 * {@code posibleReincidencia} (US-27). Es un DTO aparte, y no un campo
 * opcional del resumen, porque el resumen lo leen el mapa publico (anonimo)
 * y el ciudadano: alli el flag permitia sondear el detector de reincidencia
 * y, con eso, manipular que reportes resalta la bandeja. Ver la justificacion
 * en {@link ComentarioPublicoResponse} y en el README (SEC-02).</p>
 *
 * <p>Una senal operativa nueva va aqui, nunca en {@link ReporteResumenResponse}.</p>
 */
public record ReporteGestionResponse(
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
        Instant resolvedAt,
        boolean posibleReincidencia
) {
    public static ReporteGestionResponse from(Reporte r) {
        return new ReporteGestionResponse(
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
                r.getResolvedAt(),
                r.isPosibleReincidencia());
    }
}
