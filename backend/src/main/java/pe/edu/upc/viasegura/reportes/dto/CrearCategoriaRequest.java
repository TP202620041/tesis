package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Categoria de dano personalizada de un distrito (US-29). El distrito no
 * se pide: es el del funcionario autenticado (evita crear categorias
 * "en nombre" de otro distrito).
 */
public record CrearCategoriaRequest(
        @NotBlank @Size(max = 100) String nombre,
        @Size(max = 300) String descripcion
) {}
