package pe.edu.upc.viasegura.common.exception;

/**
 * El servidor no puede atender la peticion <b>ahora</b>, pero si un poco
 * despues: no hay turno para sanear otra foto o el almacenamiento externo no
 * respondio (DEP-12). Se traduce a <b>503</b> conservando el mensaje.
 *
 * <p>Es una respuesta del servidor y no un fallo de red, asi que la PWA
 * muestra el mensaje en vez de dejar el reporte en la cola offline (US-06),
 * y el ciudadano decide cuando reintentar.</p>
 *
 * <p>Puede llevar un {@code codigo} estable (NC-10b:
 * {@code MODERACION_NO_DISPONIBLE}) para que el cliente reaccione sin
 * comparar el mensaje: con ese codigo la PWA ofrece guardar el reporte para
 * enviarlo despues o enviarlo sin foto.</p>
 */
public class ServicioNoDisponibleException extends RuntimeException {

    private final String codigo;

    public ServicioNoDisponibleException(String mensaje) {
        this(mensaje, null);
    }

    public ServicioNoDisponibleException(String mensaje, String codigo) {
        super(mensaje);
        this.codigo = codigo;
    }

    /** El codigo para el cliente, o {@code null} si el 503 no lleva uno. */
    public String getCodigo() {
        return codigo;
    }
}
