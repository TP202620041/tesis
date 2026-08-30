package pe.edu.upc.viasegura.reportes.domain;

/**
 * Tipo de evento auditado en {@code historial_estado_reporte} (US-14, US-15).
 *
 * <p>Discrimina la linea de tiempo unica de la gestion municipal: un cambio
 * de estado del reporte frente a una asignacion de responsable interno.</p>
 */
public enum TipoEventoHistorial {
    CAMBIO_ESTADO,
    ASIGNACION
}
