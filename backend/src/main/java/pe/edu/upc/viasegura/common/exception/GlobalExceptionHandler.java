package pe.edu.upc.viasegura.common.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Manejo centralizado de excepciones para toda la API REST.
 *
 * <p>Traduce excepciones de dominio, validacion y seguridad a respuestas
 * {@link ApiError} consistentes, evitando fugas de detalles internos.</p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex, HttpServletRequest req) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), req, List.of());
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiError> handleBusiness(BusinessException ex, HttpServletRequest req) {
        return build(HttpStatus.CONFLICT, ex.getMessage(), req, List.of());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest req) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
                .map(this::formatFieldError)
                .toList();
        return build(HttpStatus.BAD_REQUEST, "Error de validacion", req, details);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleIllegalArgument(IllegalArgumentException ex, HttpServletRequest req) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), req, List.of());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleNotReadable(HttpMessageNotReadableException ex, HttpServletRequest req) {
        return build(HttpStatus.BAD_REQUEST, "Cuerpo de la peticion invalido o mal formado", req, List.of());
    }

    /**
     * Parametro de ruta o de query que no se puede convertir a su tipo
     * ({@code fechaDesde=ayer}, {@code estado=ARREGLADO}, {@code distritoId=abc}).
     *
     * <p>Sin este manejador caia en el {@code Exception.class} de abajo y
     * respondia <b>500</b>, cuando el error es del cliente (US-12). El mensaje
     * nombra el parametro y, si se puede, el formato esperado; no repite el
     * valor recibido.</p>
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex, HttpServletRequest req) {
        return build(HttpStatus.BAD_REQUEST,
                "Valor invalido para el parametro '%s'%s".formatted(ex.getName(), formatoEsperado(ex.getRequiredType())),
                req, List.of());
    }

    private String formatoEsperado(Class<?> tipo) {
        if (tipo == null) {
            return "";
        }
        if (tipo.isEnum()) {
            return ": se espera uno de " + Arrays.toString(tipo.getEnumConstants());
        }
        if (Instant.class.equals(tipo)) {
            return ": se espera una fecha ISO-8601 en UTC, p. ej. 2026-01-31T05:00:00Z";
        }
        if (Number.class.isAssignableFrom(tipo)) {
            return ": se espera un numero";
        }
        return "";
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiError> handleBadCredentials(BadCredentialsException ex, HttpServletRequest req) {
        return build(HttpStatus.UNAUTHORIZED, "Credenciales invalidas", req, List.of());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException ex, HttpServletRequest req) {
        // Mensaje fijo a proposito: esta excepcion tambien la lanza Spring
        // Security desde @PreAuthorize, y sus textos internos no estan
        // pensados para el usuario final.
        return build(HttpStatus.FORBIDDEN, "Acceso denegado", req, List.of());
    }

    /**
     * 403 que SI explica el motivo: la operacion no corresponde a este rol,
     * pero existe una via correcta y conviene nombrarla.
     */
    @ExceptionHandler(OperacionNoPermitidaException.class)
    public ResponseEntity<ApiError> handleOperacionNoPermitida(
            OperacionNoPermitidaException ex, HttpServletRequest req) {
        return build(HttpStatus.FORBIDDEN, ex.getMessage(), req, List.of());
    }

    /**
     * Ruta o archivo estatico inexistente.
     *
     * <p>Sin este manejador, la {@code NoResourceFoundException} de Spring MVC
     * caia en el {@code Exception.class} de abajo y CUALQUIER ruta inexistente
     * respondia <b>500</b> en vez de 404 — tanto un endpoint mal escrito como
     * una foto de reporte que ya no esta en disco. Un 500 le dice al cliente
     * "el servidor fallo" cuando en realidad la peticion era invalida, y
     * ademas dispararia alertas por un caso normal.</p>
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException ex, HttpServletRequest req) {
        return build(HttpStatus.NOT_FOUND, "No se encontro el recurso solicitado", req, List.of());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest req) {
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno del servidor", req, List.of());
    }

    private String formatFieldError(FieldError fe) {
        return "%s: %s".formatted(fe.getField(), fe.getDefaultMessage());
    }

    private ResponseEntity<ApiError> build(HttpStatus status, String message, HttpServletRequest req, List<String> details) {
        ApiError body = ApiError.of(status.value(), status.getReasonPhrase(), message, req.getRequestURI(), details);
        return ResponseEntity.status(status).body(body);
    }
}
