package pe.edu.upc.viasegura.desempeno.dto;

import java.math.BigDecimal;
import java.time.Instant;
import pe.edu.upc.viasegura.desempeno.domain.IndiceDesempenoDistrital;

/**
 * Fila del indice publico de desempeno distrital (US-18/US-20).
 *
 * <p>{@code categoriaId} null = agregado de todas las categorias del
 * distrito. {@code calculatedAt} indica cuando se recalculo la vista
 * materializada (util para exponer la frescura del dato).</p>
 */
public record DesempenoDistritalResponse(
        Long distritoId,
        String distritoNombre,
        Long categoriaId,
        long totalReportes,
        long totalResueltos,
        BigDecimal tasaResolucion,
        BigDecimal tiempoPromedioHoras,
        BigDecimal satisfaccionPromedio,
        long totalCalificaciones,
        Instant calculatedAt
) {
    public static DesempenoDistritalResponse from(IndiceDesempenoDistrital i) {
        return new DesempenoDistritalResponse(
                i.getDistritoId(),
                i.getDistritoNombre(),
                i.getCategoriaId(),
                i.getTotalReportes(),
                i.getTotalResueltos(),
                i.getTasaResolucion(),
                i.getTiempoPromedioHoras(),
                i.getSatisfaccionPromedio(),
                i.getTotalCalificaciones(),
                i.getCalculatedAt());
    }
}
