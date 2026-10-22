package pe.edu.upc.viasegura.common.port;

import java.util.OptionalInt;

/**
 * El proveedor de correo rechazo el mensaje o no respondio a tiempo (DEP-08).
 * Los adaptadores de {@link CorreoSaliente} traducen a ella sus errores.
 *
 * <p>El mensaje es corto y nunca incluye el destinatario, el texto del correo
 * (puede llevar un token) ni la clave del proveedor: solo que fallo, el codigo
 * de error del proveedor si lo dio y, en errores HTTP, el {@link #status()}.
 * Por la misma razon no encadena la excepcion original, cuyo mensaje si podria
 * traer esos datos (p. ej. el cuerpo de la respuesta).</p>
 *
 * <p>No se traduce a HTTP: el correo siempre se envia despues del commit y
 * fuera de la peticion, y quien llama solo registra el fallo.</p>
 */
public class CorreoNoEnviadoException extends RuntimeException {

    private final Integer status;

    public CorreoNoEnviadoException(String mensaje) {
        this(mensaje, null);
    }

    public CorreoNoEnviadoException(String mensaje, Integer status) {
        super(mensaje);
        this.status = status;
    }

    /** Codigo HTTP con el que respondio el proveedor; vacio si no respondio o no es HTTP. */
    public OptionalInt status() {
        return status == null ? OptionalInt.empty() : OptionalInt.of(status);
    }
}
