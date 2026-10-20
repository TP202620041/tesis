package pe.edu.upc.viasegura.common.exception;

import com.fasterxml.jackson.annotation.JsonInclude;
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
 * @param codigo    codigo estable para que el cliente reaccione sin leer el
 *                  mensaje (p. ej. {@code TERMINOS_PENDIENTES}, D-12). Solo
 *                  aparece en el JSON cuando lo hay.
 */
public record ApiError(
        Instant timestamp,
        int status,
        String error,
        String message,
        String path,
        List<String> details,
        @JsonInclude(JsonInclude.Include.NON_NULL) String codigo
) {
    public static ApiError of(int status, String error, String message, String path, List<String> details) {
        return new ApiError(Instant.now(), status, error, message, path, details, null);
    }

    public static ApiError conCodigo(int status, String error, String message, String path, String codigo) {
        return new ApiError(Instant.now(), status, error, message, path, List.of(), codigo);
    }
}
