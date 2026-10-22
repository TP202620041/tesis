package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Edicion de una categoria personalizada de su distrito (US-29). Mismas
 * validaciones que {@link CrearCategoriaRequest}. Reemplaza los dos campos
 * editables: {@code nombre} es obligatorio y una {@code descripcion}
 * ausente o {@code null} deja la categoria sin descripcion.
 */
public record EditarCategoriaRequest(
        @NotBlank(message = "Ingresa el nombre de la categoría")
        @Size(max = 100, message = "El nombre de la categoría puede tener como máximo {max} caracteres")
        String nombre,
        @Size(max = 300, message = "La descripción puede tener como máximo {max} caracteres")
        String descripcion
) {}
