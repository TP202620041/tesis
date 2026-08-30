package pe.edu.upc.viasegura.common.exception;

/** Se lanza cuando un recurso solicitado no existe. Mapea a HTTP 404. */
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }
}
