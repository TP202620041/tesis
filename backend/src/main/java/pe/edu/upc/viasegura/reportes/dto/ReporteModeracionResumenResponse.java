package pe.edu.upc.viasegura.reportes.dto;

import java.time.Instant;
import java.util.Map;

/**
 * Una fila de la bandeja de moderacion del ADMIN (NC-11a): un reporte con sus
 * denuncias en el estado pedido. Solo la devuelve
 * {@code GET /api/admin/moderacion/reportes}.
 *
 * @param totalDenuncias  denuncias del reporte en el estado pedido
 * @param porMotivo       cuantas de ellas por motivo (solo los motivos presentes)
 * @param primeraDenuncia la mas antigua de ellas
 * @param ultimaDenuncia  la mas reciente
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
