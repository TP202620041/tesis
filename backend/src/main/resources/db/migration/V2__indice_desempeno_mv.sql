-- =====================================================================
-- Vista materializada: Indice de desempeno distrital (US-18, US-19, US-20).
-- Datos derivados/agregados que se recalculan periodicamente (no en
-- tiempo real por request). Refrescar con:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_indice_desempeno_distrital;
-- =====================================================================
CREATE MATERIALIZED VIEW mv_indice_desempeno_distrital AS
SELECT
    d.id::text || '-' || COALESCE(r.categoria_id::text, 'ALL') AS id,
    d.id                                                       AS distrito_id,
    d.nombre                                                   AS distrito_nombre,
    r.categoria_id                                             AS categoria_id,
    COUNT(r.id)                                                AS total_reportes,
    COUNT(r.id) FILTER (WHERE r.estado = 'RESUELTO')           AS total_resueltos,
    ROUND(
        100.0 * COUNT(r.id) FILTER (WHERE r.estado = 'RESUELTO')
        / NULLIF(COUNT(r.id), 0), 2)                           AS tasa_resolucion,
    ROUND(
        AVG(EXTRACT(EPOCH FROM (r.resolved_at - r.created_at)) / 3600.0)
            FILTER (WHERE r.estado = 'RESUELTO' AND r.resolved_at IS NOT NULL)::numeric,
        2)                                                     AS tiempo_promedio_horas,
    now()                                                      AS calculated_at
FROM distrito d
LEFT JOIN reporte r ON r.distrito_id = d.id
GROUP BY GROUPING SETS ((d.id, d.nombre, r.categoria_id), (d.id, d.nombre));

-- Indice unico requerido por REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX ux_mv_indice_desempeno_id
    ON mv_indice_desempeno_distrital (id);
