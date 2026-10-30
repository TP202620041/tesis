package pe.edu.upc.viasegura.reportes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import pe.edu.upc.viasegura.reportes.domain.AlcanceModeracion;

/**
 * El ADMIN oculta o restablece contenido de un reporte (NC-11a).
 *
 * @param alcance {@code REPORTE} (todo el reporte, sale del indice) o
 *                {@code FOTO} (solo la foto, el indice no cambia)
 * @param motivo  de 10 a 500 caracteres sin los espacios del borde (lo valida
 *                el servicio). Lo leen el creador y el funcionario: no debe
 *                nombrar a quien denuncio ni decir cuantos lo hicieron, y se
 *                rechaza con 400 {@code MOTIVO_IDENTIFICA_DENUNCIANTE} si
 *                contiene el correo de un denunciante del reporte
 */
public record ModerarContenidoRequest(
        @NotNull(message = "Elige qué ocultar: el reporte o la foto")
        AlcanceModeracion alcance,
        @NotBlank(message = "Escribe el motivo")
        String motivo
) {}
