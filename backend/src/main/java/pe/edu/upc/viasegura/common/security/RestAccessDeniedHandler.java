package pe.edu.upc.viasegura.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.common.exception.ApiError;

/**
 * 403 de la cadena de seguridad con cuerpo {@link ApiError}. Si la causa son
 * los terminos pendientes (D-12), lleva {@code codigo = TERMINOS_PENDIENTES}
 * para que el frontend lleve al usuario a la pantalla de aceptacion. Los 403
 * por rol ({@code @PreAuthorize}) no pasan por aqui: los traduce
 * {@code GlobalExceptionHandler}.
 */
@Component
@RequiredArgsConstructor
public class RestAccessDeniedHandler implements AccessDeniedHandler {

    public static final String CODIGO_TERMINOS_PENDIENTES = "TERMINOS_PENDIENTES";

    private final ObjectMapper objectMapper;

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException ex) throws IOException {
        boolean terminosPendientes = Boolean.TRUE.equals(
                request.getAttribute(TerminosAceptadosAuthorizationManager.ATRIBUTO_TERMINOS_PENDIENTES));
        ApiError body = terminosPendientes
                ? ApiError.conCodigo(HttpStatus.FORBIDDEN.value(), HttpStatus.FORBIDDEN.getReasonPhrase(),
                        "Debes aceptar los terminos y la politica de privacidad vigentes para continuar",
                        request.getRequestURI(), CODIGO_TERMINOS_PENDIENTES)
                : ApiError.of(HttpStatus.FORBIDDEN.value(), HttpStatus.FORBIDDEN.getReasonPhrase(),
                        "Acceso denegado", request.getRequestURI(), List.of());
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
