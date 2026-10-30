package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import java.util.List;
import pe.edu.upc.viasegura.reportes.domain.Reporte;

/**
 * Un reporte visto por el ADMIN para moderarlo (NC-11a): sus datos, su estado
 * de moderacion y todas sus denuncias. Solo lo devuelven las rutas
 * {@code /api/admin/moderacion/reportes/{id}} (detalle, ocultamiento,
 * restablecimiento y desestimacion).
 *
 * <p>No trae la URL de la foto: si esta oculta, {@code /media/...} responde
 * 404. El ADMIN la ve siempre por {@code GET .../{id}/foto}, que la PWA
 * muestra como {@code blob:}.</p>
 *
 * @param tieneFoto  el reporte tiene foto (oculta o no)
 * @param oculto     el reporte entero esta oculto (fuera de lo publico y del indice)
 * @param fotoOculta solo la foto esta oculta
 */
public record ReporteModeracionResponse(
        Long id,
        double latitud,
        double longitud,
        String titulo,
        String descripcion,
        String severidad,
        Long categoriaId,
        String categoriaNombre,
        String estado,
        Long distritoId,
        String distritoNombre,
        Instant createdAt,
        boolean tieneFoto,
        boolean oculto,
        boolean fotoOculta,
        List<DenunciaResponse> denuncias
) {
    public static ReporteModeracionResponse from(Reporte r, List<DenunciaResponse> denuncias) {
        return new ReporteModeracionResponse(
                r.getId(),
                r.getUbicacion().getY(),
                r.getUbicacion().getX(),
                r.getTitulo(),
                r.getDescripcion(),
                r.getSeveridad() != null ? r.getSeveridad().name() : null,
                r.getCategoria().getId(),
                r.getCategoria().getNombre(),
                r.getEstado().name(),
                r.getDistrito() != null ? r.getDistrito().getId() : null,
                r.getDistrito() != null ? r.getDistrito().getNombre() : null,
                r.getCreatedAt(),
                r.getFotoUrl() != null,
                r.isOculto(),
                r.isFotoOculta(),
                denuncias);
    }
}
