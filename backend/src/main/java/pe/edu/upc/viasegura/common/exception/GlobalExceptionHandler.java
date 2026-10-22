package pe.edu.upc.viasegura.common.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.unit.DataSize;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
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

    /** Tope por archivo de {@code spring.servlet.multipart} (10 MB en application.yml). */
    private final DataSize tamanoMaximoArchivo;

    public GlobalExceptionHandler(
            @Value("${spring.servlet.multipart.max-file-size:1MB}") DataSize tamanoMaximoArchivo) {
        this.tamanoMaximoArchivo = tamanoMaximoArchivo;
    }

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

    /**
     * Archivo o peticion multipart por encima de {@code spring.servlet.multipart}
     * (DEP-11): la foto del reporte (US-05) o la de perfil (US-30).
     *
     * <p>Antes caia en el {@code Exception.class} de abajo y respondia
     * <b>500</b>, cuando el error es del cliente. 413 es el codigo de "cuerpo
     * demasiado grande"; el mensaje da el limite, con el mismo texto con que
     * la PWA lo valida antes de subir ({@code CampoFoto.tsx}), asi que esto lo
     * ven sobre todo los clientes directos del API. Si la peticion entera
     * supera {@code max-request-size}, Tomcat la rechaza sin leer el cuerpo y,
     * como solo descarta 2 MB, corta la conexion: ese cliente no llega a leer
     * el 413 (ver README, DEP-11).</p>
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> handleMaxUploadSize(MaxUploadSizeExceededException ex, HttpServletRequest req) {
        return build(HttpStatus.PAYLOAD_TOO_LARGE,
                "La foto supera %d MB".formatted(tamanoMaximoArchivo.toMegabytes()), req, List.of());
    }

    /**
     * Metodo HTTP que la ruta no admite ({@code GET /api/auth/login}) (DEP-11).
     *
     * <p>Antes respondia <b>500</b>. 405 con la cabecera {@code Allow}, que el
     * RFC 9110 exige en esta respuesta, para que el cliente sepa que metodos
     * si valen.</p>
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex, HttpServletRequest req) {
        ApiError body = ApiError.of(HttpStatus.METHOD_NOT_ALLOWED.value(),
                HttpStatus.METHOD_NOT_ALLOWED.getReasonPhrase(),
                "El metodo %s no esta permitido en esta ruta".formatted(ex.getMethod()),
                req.getRequestURI(), List.of());
        Set<HttpMethod> permitidos = ex.getSupportedHttpMethods();
        ResponseEntity.BodyBuilder respuesta = ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED);
        if (permitidos != null && !permitidos.isEmpty()) {
            respuesta.allow(permitidos.toArray(HttpMethod[]::new));
        }
        return respuesta.body(body);
    }

    /**
     * Falta un parametro obligatorio de query o de formulario
     * ({@code GET /api/distritos/por-coordenadas} sin {@code lon}) (DEP-11).
     *
     * <p>Antes respondia <b>500</b>. Es un error de validacion de la entrada:
     * 400, nombrando el parametro que falta.</p>
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiError> handleMissingParameter(
            MissingServletRequestParameterException ex, HttpServletRequest req) {
        return build(HttpStatus.BAD_REQUEST,
                "Falta el parametro obligatorio '%s'".formatted(ex.getParameterName()), req, List.of());
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
