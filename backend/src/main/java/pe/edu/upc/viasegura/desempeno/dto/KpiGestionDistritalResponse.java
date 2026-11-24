package pe.edu.upc.viasegura.desempeno.dto;

import java.math.BigDecimal;
import pe.edu.upc.viasegura.desempeno.domain.KpiGestionDistrital;

/**
 * KPIs publicos de una municipalidad en un periodo de gestion (NC-06,
 * OE3-I5).
 *
 * <p>Las metricas son {@code null} sin datos (null no es 0): la tasa sin
 * reportes validos, el tiempo sin resueltos y la satisfaccion sin
 * calificaciones. Los conteos van para que la PWA decida «Datos
 * insuficientes» (menos de 5 validos para la tasa, menos de 3 resueltos para
 * el tiempo); el servidor no oculta nada. Ningun campo es una senal
 * operativa: todos se derivan de lo que ya es publico.</p>
 */
public record KpiGestionDistritalResponse(
        Long distritoId,
        String distritoNombre,
        String municipalidadNombre,
        Long categoriaId,
        long reportesValidos,
        long reportesResueltos,
        BigDecimal tasaResolucion,
        BigDecimal tiempoPromedioDias,
        BigDecimal satisfaccionPromedio,
        long totalCalificaciones
) {
    public static KpiGestionDistritalResponse from(KpiGestionDistrital k) {
        return new KpiGestionDistritalResponse(
                k.getDistritoId(),
                k.getDistritoNombre(),
                k.getMunicipalidadNombre(),
                k.getCategoriaId(),
                k.getReportesValidos(),
                k.getReportesResueltos(),
                k.getTasaResolucion(),
                k.getTiempoPromedioDias(),
                k.getSatisfaccionPromedio(),
                k.getTotalCalificaciones());
    }
}
