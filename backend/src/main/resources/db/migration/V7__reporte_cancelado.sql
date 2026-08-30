-- ---------------------------------------------------------------------
-- V7 (US-08): agrega el estado CANCELADO -- el ciudadano retira su propio
-- reporte mientras sigue PENDIENTE (antes de que la municipalidad lo
-- reciba). Requiere dos cambios:
--
-- 1. ck_reporte_estado admite el nuevo valor.
-- 2. El indice de desempeno distrital (US-18/US-20) deja de contar los
--    reportes CANCELADO en total_reportes: nunca entraron al flujo de
--    gestion municipal (se cancelan solo desde PENDIENTE), por lo que
--    incluirlos degradaria la tasa_resolucion de un distrito por una
--    decision del ciudadano, no por desempeno municipal. El filtro va en
--    la condicion del JOIN (no en WHERE) para preservar el LEFT JOIN y
--    seguir mostrando distritos sin reportes validos.
-- ---------------------------------------------------------------------
ALTER TABLE reporte DROP CONSTRAINT ck_reporte_estado;
ALTER TABLE reporte ADD CONSTRAINT ck_reporte_estado
    CHECK (estado IN ('PENDIENTE', 'RECIBIDO', 'EN_PROCESO', 'RESUELTO', 'RECHAZADO', 'CANCELADO'));

DROP MATERIALIZED VIEW IF EXISTS mv_indice_desempeno_distrital;

CREATE MATERIALIZED VIEW mv_indice_desempeno_distrital AS
SELECT
    d.id::text || '-' ||
        CASE WHEN GROUPING(r.categoria_id) = 1 THEN 'ALL'
             ELSE r.categoria_id::text END                     AS id,
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
    ROUND(AVG(cal.avg_estrellas), 2)                           AS satisfaccion_promedio,
    COALESCE(SUM(cal.n), 0)::bigint                            AS total_calificaciones,
    now()                                                      AS calculated_at
FROM distrito d
LEFT JOIN reporte r ON r.distrito_id = d.id AND r.estado <> 'CANCELADO'
LEFT JOIN (
    SELECT reporte_id, AVG(estrellas)::numeric AS avg_estrellas, COUNT(*) AS n
    FROM calificacion
    GROUP BY reporte_id
) cal ON cal.reporte_id = r.id
GROUP BY GROUPING SETS ((d.id, d.nombre, r.categoria_id), (d.id, d.nombre))
HAVING GROUPING(r.categoria_id) = 1 OR r.categoria_id IS NOT NULL;

CREATE UNIQUE INDEX ux_mv_indice_desempeno_id
    ON mv_indice_desempeno_distrital (id);
