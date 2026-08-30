package pe.edu.upc.viasegura.reportes.event;

/**
 * Evento de dominio: un ciudadano califico un reporte (US-26).
 *
 * <p>Punto de extension (Observer) para recalcular la satisfaccion del
 * indice de desempeno distrital (US-18/US-20) de forma dirigida por evento.</p>
 *
 * @param reporteId reporte calificado
 */
public record CalificacionRegistradaEvent(Long reporteId) {}
