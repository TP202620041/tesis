package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Comentario publico de un ciudadano sobre un reporte resuelto (US-27). */
public record ComentarPublicoRequest(
        @NotBlank(message = "Escribe tu comentario")
        @Size(max = 1000, message = "El comentario puede tener como máximo {max} caracteres")
        String contenido
) {}
