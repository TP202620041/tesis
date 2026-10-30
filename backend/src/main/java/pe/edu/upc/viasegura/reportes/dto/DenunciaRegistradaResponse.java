package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.reportes.domain.DenunciaReporte;

/**
 * Respuesta al ciudadano que denuncio (NC-11a): solo su propia denuncia. No
 * dice cuantas denuncias tiene el reporte ni si alguien mas lo denuncio.
 */
public record DenunciaRegistradaResponse(
        Long id,
        Long reporteId,
        String motivo,
        Instant createdAt
) {
    public static DenunciaRegistradaResponse from(DenunciaReporte d) {
        return new DenunciaRegistradaResponse(
                d.getId(), d.getReporte().getId(), d.getMotivo().name(), d.getCreatedAt());
    }
}
