package pe.edu.upc.viasegura.reportes.event;

import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;

/**
 * Evento de dominio: el estado de un reporte cambio (US-14).
 *
 * <p>Punto de extension (patron Observer) consumido por el modulo de
 * notificaciones (US-16/US-21): {@code ReporteEstadoCambiadoListener} lo
 * recibe {@code AFTER_COMMIT} y notifica al ciudadano (push/email).</p>
 *
 * <p>El evento lleva todo el <em>contexto del cambio</em> (que paso, sobre
 * que reporte, en que distrito, para quien y con que comentario) para que
 * el listener no tenga que reconstruirlo desde la BD. NO lleva datos de
 * entrega (email/preferencia del ciudadano): esos son configuracion mutable
 * que el listener lee del {@code Usuario} en el momento del envio.</p>
 *
 * @param reporteId       reporte afectado
 * @param creadorId       ciudadano que origino el reporte (destinatario natural)
 * @param distritoId      distrito del reporte (jurisdiccion)
 * @param distritoNombre  nombre del distrito, para componer el mensaje
 * @param anterior        estado previo
 * @param nuevo           estado nuevo
 * @param comentario      comentario del cambio (puede ser null)
 */
public record ReporteEstadoCambiadoEvent(
        Long reporteId,
        Long creadorId,
        Long distritoId,
        String distritoNombre,
        EstadoReporte anterior,
        EstadoReporte nuevo,
        String comentario
) {}
