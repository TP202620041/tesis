package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import pe.edu.upc.viasegura.reportes.domain.IconoCategoria;

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
        String descripcion,
        /** US-29 Esc. 1: uno del conjunto cerrado {@link IconoCategoria}; reemplaza el actual como {@code descripcion}: ausente o {@code null} deja la categoria sin icono. Un valor fuera del conjunto es 400. */
        IconoCategoria icono
) {}
