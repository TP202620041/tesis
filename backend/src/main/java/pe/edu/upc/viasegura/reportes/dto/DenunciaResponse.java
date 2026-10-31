package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.reportes.domain.DenunciaReporte;

/**
 * Una denuncia vista por el ADMIN (NC-11a). <b>Solo la devuelven las rutas
 * {@code /api/admin/moderacion/**}</b>: la identidad y el conteo de quienes
 * denunciaron no llegan ni al creador del reporte ni al funcionario.
 *
 * @param denuncianteId     {@code null} si la cuenta se cerro (BE-14 la anonimiza)
 * @param motivoResolucion  lo que escribio el ADMIN al atenderla o desestimarla
 */
public record DenunciaResponse(
        Long id,
        String motivo,
        String detalle,
        String estado,
        Instant createdAt,
        Long denuncianteId,
        String denuncianteNombre,
        String denuncianteEmail,
        Instant resueltaEn,
        String motivoResolucion
) {
    public static DenunciaResponse from(DenunciaReporte d) {
        Usuario u = d.getDenunciante();
        return new DenunciaResponse(
                d.getId(),
                d.getMotivo().name(),
                d.getDetalle(),
                d.getEstado().name(),
                d.getCreatedAt(),
                u != null ? u.getId() : null,
                u != null ? u.getNombre() + " " + u.getApellido() : null,
                u != null ? u.getEmail() : null,
                d.getResueltaEn(),
                d.getMotivoResolucion());
    }
}
