package pe.edu.upc.viasegura.common.exception;

/**
 * Se lanza al violar una regla de negocio (p.ej. email ya registrado).
 * Mapea a HTTP 409 (Conflict).
 *
 * <p>Puede llevar un {@code codigo} estable (NC-09: {@code CORREO_NO_CONFIRMADO})
 * para que el cliente reaccione sin leer el mensaje; va en
 * {@link ApiError#codigo()}. Sin codigo, el JSON no lo trae.</p>
 */
public class BusinessException extends RuntimeException {

    private final String codigo;

    public BusinessException(String message) {
        this(message, null);
    }

    public BusinessException(String message, String codigo) {
        super(message);
        this.codigo = codigo;
    }

    /** Codigo estable para el cliente, o {@code null}. */
    public String getCodigo() {
        return codigo;
    }
}
