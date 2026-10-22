package pe.edu.upc.viasegura.common.exception;

/**
 * El servidor no puede atender la peticion <b>ahora</b>, pero si un poco
 * despues: no hay turno para sanear otra foto o el almacenamiento externo no
 * respondio (DEP-12). Se traduce a <b>503</b> conservando el mensaje.
 *
 * <p>Es una respuesta del servidor y no un fallo de red, asi que la PWA
 * muestra el mensaje en vez de dejar el reporte en la cola offline (US-06),
 * y el ciudadano decide cuando reintentar.</p>
 */
public class ServicioNoDisponibleException extends RuntimeException {

    public ServicioNoDisponibleException(String mensaje) {
        super(mensaje);
    }
}
