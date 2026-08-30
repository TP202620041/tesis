package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Comentario publico de un ciudadano sobre un reporte resuelto (US-27). */
public record ComentarPublicoRequest(
        @NotBlank @Size(max = 1000) String contenido
) {}
