package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Activa o desactiva una categoria personalizada de su distrito (US-29).
 * Desactivar solo hace que deje de ofrecerse para reportes nuevos.
 */
public record CambiarActivaCategoriaRequest(
        @NotNull Boolean activa
) {}
