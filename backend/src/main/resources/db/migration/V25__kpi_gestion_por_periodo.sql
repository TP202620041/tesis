-- ---------------------------------------------------------------------
-- V25 (NC-06): KPIs por municipalidad y periodo de gestion (OE3-I5).
-- Decisiones del usuario del 23/11 (A / A / A):
-- project-context/decisions/propuestas/2026-11-23-nc-06-kpis-gestion-y-d10.md
--
-- 1. Periodo 2027-01-01 -> 2030-12-31, para que el filtro del dashboard
--    tenga mas de un periodo. No se edita V15: se agrega aqui. No se solapa
--    con 2023-2026 (V16); si alguien ya lo hubiera cargado a mano, no se
--    inserta dos veces.
-- 2. Los reportes sin periodo cuya fecha de creacion (hora de Lima) cae en
--    el periodo nuevo lo reciben, igual que el relleno de V17. Hoy no hay
--    ninguno (2027 no ha empezado); queda por si una base tuviera fechas
--    sembradas a mano.
-- 3. Vista materializada mv_kpi_gestion_distrital: una fila por periodo x
--    distrito (= municipalidad, D-09), mas una por categoria con reportes.
--    No se crea GESTION_MUNICIPAL: el par distrito x periodo ya la
--    identifica (decision 2).
--
-- Formulas (decision 1, las del indice de V21 agrupadas por periodo):
--   - validos: todos salvo CANCELADO y los ocultos por el ADMIN. Los
--     RECHAZADO cuentan (SEC-01: rechazar no mejora la tasa).
--   - tasa_resolucion = resueltos / validos * 100, dos decimales; NULL sin
--     validos.
--   - tiempo_promedio_dias = promedio de (resolved_at - created_at) de los
--     resueltos, en dias con un decimal; NULL sin resueltos.
--   - satisfaccion_promedio = promedio de las estrellas de las
--     calificaciones de los reportes validos; NULL sin calificaciones.
--   - El reporte cuenta en el periodo de su creacion
--     (reporte.periodo_gestion_id) aunque se resuelva en el siguiente.
--
-- Es una vista, no una tabla: no entra en limpiezaFkSafe de los IT.
-- ---------------------------------------------------------------------

-- 1. Periodo 2027-2030.
INSERT INTO periodo_gestion (fecha_inicio, fecha_fin)
SELECT DATE '2027-01-01', DATE '2030-12-31'
WHERE NOT EXISTS (
    SELECT 1 FROM periodo_gestion
     WHERE daterange(fecha_inicio, fecha_fin, '[]') && daterange(DATE '2027-01-01', DATE '2030-12-31', '[]'));

-- 2. Reportes sin periodo que caen en uno.
UPDATE reporte r
   SET periodo_gestion_id = p.id
  FROM periodo_gestion p
 WHERE r.periodo_gestion_id IS NULL
   AND (r.created_at AT TIME ZONE 'America/Lima')::date BETWEEN p.fecha_inicio AND p.fecha_fin;

-- 3. KPIs por periodo. El CROSS JOIN da una fila por cada distrito en cada
-- periodo aunque no tenga reportes («Sin datos»: conteos 0 y metricas NULL).
-- Los filtros del reporte van en la condicion del LEFT JOIN, no en WHERE,
-- para no perder esos distritos. Las calificaciones se suman por reporte en
-- una subconsulta para no multiplicar las filas de reporte; la satisfaccion
-- es suma de estrellas / numero de calificaciones (promedio por
-- calificacion, no promedio de promedios).
CREATE MATERIALIZED VIEW mv_kpi_gestion_distrital AS
SELECT
    p.id::text || '-' || d.id::text || '-' ||
        CASE WHEN GROUPING(r.categoria_id) = 1 THEN 'ALL'
             ELSE r.categoria_id::text END                     AS id,
    p.id                                                       AS periodo_gestion_id,
    d.id                                                       AS distrito_id,
    d.nombre                                                   AS distrito_nombre,
    m.nombre                                                   AS municipalidad_nombre,
    r.categoria_id                                             AS categoria_id,
    COUNT(r.id)                                                AS reportes_validos,
    COUNT(r.id) FILTER (WHERE r.estado = 'RESUELTO')           AS reportes_resueltos,
    ROUND(
        100.0 * COUNT(r.id) FILTER (WHERE r.estado = 'RESUELTO')
        / NULLIF(COUNT(r.id), 0), 2)                           AS tasa_resolucion,
    ROUND(
        (AVG(EXTRACT(EPOCH FROM (r.resolved_at - r.created_at)) / 86400.0)
            FILTER (WHERE r.estado = 'RESUELTO' AND r.resolved_at IS NOT NULL))::numeric,
        1)                                                     AS tiempo_promedio_dias,
    ROUND(SUM(cal.suma)::numeric / NULLIF(SUM(cal.n), 0), 2)   AS satisfaccion_promedio,
    COALESCE(SUM(cal.n), 0)::bigint                            AS total_calificaciones,
    now()                                                      AS calculated_at
FROM periodo_gestion p
CROSS JOIN distrito d
LEFT JOIN municipalidad m ON m.distrito_id = d.id
LEFT JOIN reporte r
       ON r.distrito_id = d.id
      AND r.periodo_gestion_id = p.id
      AND r.estado <> 'CANCELADO'
      AND NOT r.oculto
LEFT JOIN (
    SELECT reporte_id, SUM(estrellas) AS suma, COUNT(*) AS n
    FROM calificacion
    GROUP BY reporte_id
) cal ON cal.reporte_id = r.id
GROUP BY GROUPING SETS (
    (p.id, d.id, d.nombre, m.nombre, r.categoria_id),
    (p.id, d.id, d.nombre, m.nombre))
HAVING GROUPING(r.categoria_id) = 1 OR r.categoria_id IS NOT NULL;

-- Requerido por REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX ux_mv_kpi_gestion_id ON mv_kpi_gestion_distrital (id);
-- Lectura del dashboard: siempre por periodo, y por categoria o la fila ALL.
CREATE INDEX ix_mv_kpi_gestion_periodo ON mv_kpi_gestion_distrital (periodo_gestion_id, categoria_id);
