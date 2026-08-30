package pe.edu.upc.viasegura.common.exception;

import java.time.Instant;
import java.util.List;

/**
 * Cuerpo estandar de respuesta de error de la API REST.
 *
 * @param timestamp momento en que se produjo el error
 * @param status    codigo HTTP
 * @param error     frase asociada al codigo HTTP
 * @param message   mensaje legible para el cliente
 * @param path      ruta de la peticion que fallo
 * @param details   detalles adicionales (p.ej. errores de validacion por campo)
 */
public record ApiError(
        Instant timestamp,
        int status,
        String error,
        String message,
        String path,
        List<String> details
) {
    public static ApiError of(int status, String error, String message, String path, List<String> details) {
        return new ApiError(Instant.now(), status, error, message, path, details);
    }
}
