package pe.edu.upc.viasegura.moderacion.port;

/**
 * El servicio de moderacion no pudo medir la foto: no respondio, se paso del
 * timeout, no hubo turno a tiempo o respondio algo que no cumple el contrato.
 * Los adaptadores de {@link ModeradorDeImagen} traducen sus errores a esta
 * excepcion.
 *
 * <p>No llega tal cual al cliente: en la creacion,
 * {@code ModeracionService} la traduce a 503 {@code MODERACION_NO_DISPONIBLE}
 * (falla cerrada, decision del usuario del 28/10); en la vista previa, a
 * {@code fotoRechazada: false}.</p>
 */
public class ModeracionNoDisponibleException extends RuntimeException {

    public ModeracionNoDisponibleException(String mensaje) {
        super(mensaje);
    }
}
