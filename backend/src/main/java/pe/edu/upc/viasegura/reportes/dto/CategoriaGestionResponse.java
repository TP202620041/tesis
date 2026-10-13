package pe.edu.upc.viasegura.reportes.dto;

import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;

/**
 * Categoria vista por el funcionario que la gestiona (US-29). A diferencia
 * de {@link CategoriaDanoResponse} (catalogo publico, solo activas), incluye
 * {@code activo}: la pantalla de gestion lista tambien las desactivadas
 * para poder reactivarlas. Solo lo devuelven endpoints con rol
 * FUNCIONARIO_MUNICIPAL.
 */
public record CategoriaGestionResponse(
        Long id,
        String nombre,
        String descripcion,
        boolean esEstandar,
        boolean activo,
        Long distritoId,
        String distritoNombre
) {
    public static CategoriaGestionResponse from(CategoriaDano c) {
        return new CategoriaGestionResponse(
                c.getId(), c.getNombre(), c.getDescripcion(), c.isEsEstandar(), c.isActivo(),
                c.getDistrito() != null ? c.getDistrito().getId() : null,
                c.getDistrito() != null ? c.getDistrito().getNombre() : null);
    }
}
