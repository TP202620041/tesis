package pe.edu.upc.viasegura.notificaciones.domain;

/** Evento de negocio que origina una notificacion al ciudadano. */
public enum TipoEvento {
    REPORTE_RECIBIDO,
    REPORTE_EN_PROCESO,
    REPORTE_RESUELTO,
    REPORTE_RECHAZADO,
    ADHESION_REGISTRADA
}
