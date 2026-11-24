package pe.edu.upc.viasegura.desempeno.dto;

import java.time.Instant;
import java.util.List;

/**
 * Dashboard publico por periodo de gestion (NC-06).
 *
 * <p>{@code periodo} es el consultado (el vigente si no se pidio uno).
 * {@code categoriaId} null = agregado de todas las categorias.
 * {@code calculatedAt}: cuando se recalculo la vista (frescura del dato);
 * null si no hay filas.</p>
 */
public record DashboardGestionResponse(
        PeriodoGestionResponse periodo,
        Long categoriaId,
        Instant calculatedAt,
        List<KpiGestionDistritalResponse> distritos
) {}
