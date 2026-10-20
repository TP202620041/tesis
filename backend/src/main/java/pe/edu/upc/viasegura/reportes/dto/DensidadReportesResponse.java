package pe.edu.upc.viasegura.reportes.dto;

import java.util.List;

/**
 * Densidad de reportes para la capa de calor del mapa (US-11).
 *
 * <p>Los reportes se agregan en una grilla fija de {@code celdaGrados}
 * grados (unos 110 m en Lima) y se devuelve una celda por punto de la grilla
 * con al menos un reporte. Publico y anonimo: no lleva nada que dependa de
 * quien consulta ni senales internas (SEC-02).</p>
 *
 * @param celdaGrados   lado de la celda en grados (latitud y longitud)
 * @param totalReportes suma de {@code cantidad} de todas las celdas
 * @param celdas        celdas con reportes, de mayor a menor cantidad
 */
public record DensidadReportesResponse(
        double celdaGrados,
        long totalReportes,
        List<CeldaDensidadResponse> celdas
) {}
