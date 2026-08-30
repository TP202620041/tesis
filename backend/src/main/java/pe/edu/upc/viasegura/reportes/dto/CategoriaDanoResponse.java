package pe.edu.upc.viasegura.reportes.dto;

import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;

public record CategoriaDanoResponse(
        Long id,
        String nombre,
        String descripcion,
        boolean esEstandar,
        Long distritoId,
        String distritoNombre
) {
    public static CategoriaDanoResponse from(CategoriaDano c) {
        return new CategoriaDanoResponse(
                c.getId(), c.getNombre(), c.getDescripcion(), c.isEsEstandar(),
                c.getDistrito() != null ? c.getDistrito().getId() : null,
                c.getDistrito() != null ? c.getDistrito().getNombre() : null);
    }
}
