package pe.edu.upc.viasegura.moderacion.domain;

/**
 * Para que se modera una foto (NC-10b). El adaptador decide con esto cuanto
 * espera un turno del servicio de inferencia, como {@code OrigenDeConsulta}
 * en la clasificacion: el puerto dice para que es la llamada, no como se
 * reparte la capacidad.
 */
public enum OrigenDeModeracion {

    /**
     * {@code POST /api/clasificaciones}: un aviso mientras el ciudadano arma el
     * reporte. No espera turno: sin turno, la foto queda sin revisar
     * ({@code fotoRechazada: false}) y el veredicto oficial es el de la
     * creacion.
     */
    VISTA_PREVIA,

    /**
     * {@code POST /api/reportes}: el veredicto oficial. Espera un turno hasta
     * 1 s; sin turno, la creacion falla cerrada con 503
     * {@code MODERACION_NO_DISPONIBLE} (decision del usuario del 28/10).
     */
    CREACION
}
