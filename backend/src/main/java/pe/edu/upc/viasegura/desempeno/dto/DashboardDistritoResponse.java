package pe.edu.upc.viasegura.desempeno.dto;

/**
 * Dashboard interno del funcionario para su propio distrito (US-17).
 *
 * <p>{@code resumen} es el mismo dato del indice publico (US-18/US-20)
 * filtrado al distrito del funcionario -- no se duplica. Lo que agrega
 * este endpoint son las 2 metricas operativas internas que NO tiene
 * sentido publicar (no son de transparencia ciudadana, son gestion
 * interna): reportes sin responsable asignado y reportes estancados.</p>
 */
public record DashboardDistritoResponse(
        DesempenoDistritalResponse resumen,
        long reportesSinResponsable,
        long reportesEstancados
) {}
