package pe.edu.upc.viasegura.auth.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Datos de registro de una cuenta ciudadana (US-01).
 * El registro publico crea siempre usuarios con rol CIUDADANO.
 *
 * <p>D-12: el registro exige aceptar los terminos y la politica de
 * privacidad. {@code aceptaTerminos} ausente o {@code false} es 400 (forma
 * del pedido); {@code versionTerminos} distinta de la vigente es 409 (el
 * cliente mostro un texto que ya no rige).</p>
 */
public record RegistroRequest(
        @NotBlank @Email @Size(max = 150) String email,
        @NotBlank @Size(min = 8, max = 72) String password,
        @NotBlank @Size(max = 100) String nombre,
        @NotBlank @Size(max = 100) String apellido,
        @NotNull @AssertTrue(message = "debe aceptar los terminos y la politica de privacidad")
        Boolean aceptaTerminos,
        @NotBlank @Size(max = 40) String versionTerminos
) {}
