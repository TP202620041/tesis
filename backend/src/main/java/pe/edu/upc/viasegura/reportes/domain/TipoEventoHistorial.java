package pe.edu.upc.viasegura.reportes.domain;

/**
 * Tipo de evento auditado en {@code historial_estado_reporte} (US-14, US-15,
 * NC-11a).
 *
 * <p>Discrimina la linea de tiempo unica del reporte: un cambio de estado,
 * una asignacion de responsable interno y, desde NC-11a (D-15), las cuatro
 * acciones de moderacion del ADMIN. Estas ultimas no tienen estados y llevan
 * siempre el motivo en el comentario (CHECK de V21).</p>
 */
public enum TipoEventoHistorial {
    CAMBIO_ESTADO,
    ASIGNACION,
    FOTO_OCULTA,
    REPORTE_OCULTO,
    FOTO_RESTABLECIDA,
    REPORTE_RESTABLECIDO;

    /** Texto fijo del servidor en {@link #REPORTE_OCULTO}: lo ven todos los que leen el historial. */
    public static final String AVISO_INDICE_OCULTO =
            "Mientras esté oculto, este reporte no cuenta en el índice de desempeño.";

    /** Texto fijo del servidor en {@link #REPORTE_RESTABLECIDO}. */
    public static final String AVISO_INDICE_RESTABLECIDO = "Vuelve a contar en el índice de desempeño.";

    /** {@code true} para las cuatro acciones del ADMIN (NC-11a). */
    public boolean esModeracion() {
        return this == FOTO_OCULTA || this == REPORTE_OCULTO
                || this == FOTO_RESTABLECIDA || this == REPORTE_RESTABLECIDO;
    }

    /** {@code true} si la accion oculta contenido (y no lo restablece). */
    public boolean oculta() {
        return this == FOTO_OCULTA || this == REPORTE_OCULTO;
    }

    /**
     * El texto fijo sobre el indice de desempeno que acompana al evento, o
     * {@code null}. Solo ocultar o restablecer <b>el reporte</b> mueve el
     * indice (decision del usuario del 28/10); la foto no.
     */
    public String avisoIndice() {
        return switch (this) {
            case REPORTE_OCULTO -> AVISO_INDICE_OCULTO;
            case REPORTE_RESTABLECIDO -> AVISO_INDICE_RESTABLECIDO;
            default -> null;
        };
    }
}
