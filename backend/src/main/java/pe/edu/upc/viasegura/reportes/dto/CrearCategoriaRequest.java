package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import pe.edu.upc.viasegura.reportes.domain.IconoCategoria;

/**
 * Categoria de dano personalizada de un distrito (US-29). El distrito no
 * se pide: es el del funcionario autenticado (evita crear categorias
 * "en nombre" de otro distrito).
 */
public record CrearCategoriaRequest(
        @NotBlank(message = "Ingresa el nombre de la categoría")
        @Size(max = 100, message = "El nombre de la categoría puede tener como máximo {max} caracteres")
        String nombre,
        @Size(max = 300, message = "La descripción puede tener como máximo {max} caracteres")
        String descripcion,
        /** US-29 Esc. 1: uno del conjunto cerrado {@link IconoCategoria}; opcional; {@code null} = sin icono. Un valor fuera del conjunto es 400. */
        IconoCategoria icono
) {}
