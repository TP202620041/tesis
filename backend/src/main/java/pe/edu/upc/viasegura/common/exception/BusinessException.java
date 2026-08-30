package pe.edu.upc.viasegura.common.exception;

/**
 * Se lanza al violar una regla de negocio (p.ej. email ya registrado).
 * Mapea a HTTP 409 (Conflict).
 */
public class BusinessException extends RuntimeException {
    public BusinessException(String message) {
        super(message);
    }
}
