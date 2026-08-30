package pe.edu.upc.viasegura.reportes.event;

/**
 * Evento de dominio: el creador cambio la categoria de su reporte (US-08).
 *
 * <p>Punto de extension (Observer) para el indice de desempeno: el desglose
 * por categoria de US-20 agrupa por {@code (distrito, categoria)}, asi que
 * mover un reporte de una categoria a otra resta en una fila y suma en la
 * otra. El agregado general del distrito no cambia, pero el desglose si.</p>
 *
 * <p>Solo se publica cuando la categoria cambio de verdad: un PATCH que
 * reenvia la misma categoria no altera ninguna metrica.</p>
 *
 * @param reporteId          reporte editado
 * @param distritoId         distrito del reporte (no cambia al editar)
 * @param categoriaAnterior  categoria antes del cambio
 * @param categoriaNueva     categoria despues del cambio
 */
public record ReporteCategoriaCambiadaEvent(
        Long reporteId,
        Long distritoId,
        Long categoriaAnterior,
        Long categoriaNueva
) {}
