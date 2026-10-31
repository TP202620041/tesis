package pe.edu.upc.viasegura.reportes.domain;

/**
 * Que oculta o restablece el ADMIN (NC-11a, D-15). El reporte y la foto se
 * ocultan <b>por separado</b> (decision del usuario del 28/10): ocultar solo
 * la foto deja el reporte publico y contando en el indice de desempeno.
 */
public enum AlcanceModeracion {
    REPORTE,
    FOTO;

    /** El evento de la linea de tiempo al ocultar. */
    public TipoEventoHistorial eventoAlOcultar() {
        return this == REPORTE ? TipoEventoHistorial.REPORTE_OCULTO : TipoEventoHistorial.FOTO_OCULTA;
    }

    /** El evento de la linea de tiempo al restablecer. */
    public TipoEventoHistorial eventoAlRestablecer() {
        return this == REPORTE ? TipoEventoHistorial.REPORTE_RESTABLECIDO : TipoEventoHistorial.FOTO_RESTABLECIDA;
    }

    /** Solo el reporte entra y sale del indice de desempeno; la foto no. */
    public boolean mueveElIndice() {
        return this == REPORTE;
    }
}
