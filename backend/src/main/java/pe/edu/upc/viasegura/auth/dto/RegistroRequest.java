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
        @NotBlank(message = "Ingresa tu correo")
        @Email(message = "El correo no tiene un formato válido")
        @Size(max = 150, message = "El correo puede tener como máximo {max} caracteres")
        String email,
        @NotBlank(message = "Ingresa una contraseña")
        @Size(min = 8, max = 72, message = "La contraseña debe tener entre {min} y {max} caracteres")
        String password,
        @NotBlank(message = "Ingresa tu nombre")
        @Size(max = 100, message = "El nombre puede tener como máximo {max} caracteres")
        String nombre,
        @NotBlank(message = "Ingresa tu apellido")
        @Size(max = 100, message = "El apellido puede tener como máximo {max} caracteres")
        String apellido,
        @NotNull(message = "Debes aceptar los términos de uso y la política de privacidad")
        @AssertTrue(message = "Debes aceptar los términos de uso y la política de privacidad")
        Boolean aceptaTerminos,
        @NotBlank(message = "Falta la versión de los términos que aceptas")
        @Size(max = 40, message = "La versión de los términos puede tener como máximo {max} caracteres")
        String versionTerminos
) {}
