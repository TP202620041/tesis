package pe.edu.upc.viasegura.reportes.event;

/**
 * Evento de dominio: se registro un reporte NUEVO (US-05).
 *
 * <p>Punto de extension (Observer) para recalcular el indice de desempeno
 * distrital (US-18/US-20): crear un reporte incrementa {@code total_reportes},
 * que es el DENOMINADOR de la tasa de resolucion. Sin este evento el indice
 * publico seguia mostrando la tasa anterior —mejor que la real— hasta que
 * ocurriera algo no relacionado que disparara el refresh.</p>
 *
 * <p><b>No se publica en una adhesion</b> (US-09): adherirse a un reporte
 * cercano existente no inserta una fila nueva en {@code reporte}, asi que
 * {@code total_reportes} no cambia y refrescar seria trabajo inutil.</p>
 *
 * <p>Tambien dispara la sugerencia oficial de categoria (NC-04, D-08,
 * {@code SugerenciaCategoriaListener}), solo si el reporte tiene foto.</p>
 *
 * @param reporteId   reporte recien creado
 * @param distritoId  distrito asignado automaticamente por coordenadas
 * @param categoriaId categoria del dano (afecta el desglose de US-20)
 * @param conFoto     si se guardo una foto con el reporte: sin foto no hay
 *                    nada que clasificar y no se encola ninguna tarea
 */
public record ReporteCreadoEvent(Long reporteId, Long distritoId, Long categoriaId, boolean conFoto) {}
