package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import java.util.Map;

/**
 * Una fila de la bandeja de moderacion del ADMIN (NC-11a): un reporte con sus
 * denuncias en el estado pedido o, con {@code ocultos=true} (NC-11a2), un
 * reporte con el reporte o la foto ocultos y <b>todas</b> sus denuncias. Solo
 * la devuelve {@code GET /api/admin/moderacion/reportes}.
 *
 * @param totalDenuncias  denuncias del reporte en el estado pedido (en
 *                        cualquier estado con {@code ocultos=true}; puede ser 0)
 * @param porMotivo       cuantas de ellas por motivo (solo los motivos presentes)
 * @param primeraDenuncia la mas antigua de ellas; {@code null} solo con
 *                        {@code ocultos=true} y sin denuncias
 * @param ultimaDenuncia  la mas reciente; {@code null} en el mismo caso
 */
public record ReporteModeracionResumenResponse(
        Long reporteId,
        String titulo,
        String estado,
        Long distritoId,
        String distritoNombre,
        boolean tieneFoto,
        boolean oculto,
        boolean fotoOculta,
        long totalDenuncias,
        Map<String, Long> porMotivo,
        Instant primeraDenuncia,
        Instant ultimaDenuncia
) {}
