package pe.edu.upc.viasegura.distritos.dto;

import pe.edu.upc.viasegura.distritos.domain.Distrito;

/**
 * Distrito como dato de referencia para selectores y filtros.
 *
 * <p>Deliberadamente NO expone {@code limites}: el MultiPolygon de cada
 * distrito pesa miles de vertices y no sirve para poblar un {@code <select>}.
 * Si en algun momento el frontend necesita dibujar los poligonos (p.ej. el
 * mapa de calor de US-11, pospuesto), eso amerita un endpoint aparte -- con
 * GeoJSON y su propia politica de cache -- y no engordar este.</p>
 */
public record DistritoResponse(
        Long id,
        String nombre,
        String ubigeo
) {
    public static DistritoResponse from(Distrito d) {
        return new DistritoResponse(d.getId(), d.getNombre(), d.getUbigeo());
    }
}
