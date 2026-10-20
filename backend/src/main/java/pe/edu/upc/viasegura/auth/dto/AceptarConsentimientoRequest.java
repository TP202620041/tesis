package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;

/**
 * Aceptacion de un consentimiento por el propio usuario (D-12).
 *
 * <p>{@code version} es la version del texto que el usuario leyo y acepto.
 * Para {@code TERMINOS_Y_PRIVACIDAD} debe ser la vigente
 * ({@code app.legal.version-terminos}); si no, 409. Para las finalidades de
 * notificaciones se guarda tal cual: identifica el texto del aviso que vio.</p>
 */
public record AceptarConsentimientoRequest(
        @NotNull FinalidadConsentimiento finalidad,
        @NotBlank @Size(max = 40) String version
) {}
