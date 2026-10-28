package pe.edu.upc.viasegura.clasificacion.domain;

/**
 * Quien pide la deteccion (NC-04c). El adaptador del clasificador decide con
 * esto cuanto puede esperar un turno del servicio de inferencia: el puerto
 * dice para que es la llamada, no como se reparte la capacidad.
 */
public enum OrigenDeConsulta {

    /**
     * {@code POST /api/clasificaciones}: el ciudadano espera en pantalla
     * mientras arma el reporte. Sin turno, «sin sugerencia» al instante: elige
     * la categoria a mano.
     */
    VISTA_PREVIA,

    /**
     * La sugerencia oficial (D-08), despues del commit y en un hilo
     * asincrono: no hace esperar a nadie, asi que puede esperar un turno
     * (hasta 10 s en el adaptador HTTP, decision del usuario del 28/10) en
     * vez de perderse.
     */
    SUGERENCIA_OFICIAL
}
