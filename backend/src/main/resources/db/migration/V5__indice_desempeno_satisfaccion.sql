-- ---------------------------------------------------------------------
-- V5 (US-18/US-20): agrega la satisfaccion promedio (AVG de estrellas,
-- US-26) al indice de desempeno distrital. Una vista materializada no
-- admite ALTER para sumar columnas, asi que se recrea (DROP + CREATE)
-- conservando todas las columnas e indice previos: la entidad
-- IndiceDesempenoDistrital solo SUMA campos (compat. hacia atras, como V4).
--
-- Correccion de un bug latente de V2: el id
--   d.id || '-' || COALESCE(categoria_id, 'ALL')
-- colisionaba para distritos SIN reportes, porque el grouping set general y
-- el grouping set por-categoria (con categoria_id NULL por el LEFT JOIN)
-- producian ambos "<id>-ALL". V2 nunca lo disparo porque corrio sobre la
-- tabla distrito vacia (el seeder es un ApplicationRunner posterior); al
-- recrear la vista sobre 43 distritos, la colision rompe el indice unico.
-- Se distingue el agregado general con GROUPING() y se descartan las filas
-- espurias de categoria NULL con el HAVING.
--
-- La satisfaccion se une sin ambiguedad via reporte (calificacion ->
-- reporte -> distrito) y se PRE-AGREGA por reporte en una subconsulta para
-- no multiplicar los conteos de reportes al hacer el JOIN.
-- ---------------------------------------------------------------------
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
    -- SUM(bigint) devuelve numeric en Postgres; se castea a bigint para que
    -- coincida con el mapeo long de la entidad (Hibernate ddl-auto=validate).
    COALESCE(SUM(cal.n), 0)::bigint                            AS total_calificaciones,
    now()                                                      AS calculated_at
FROM distrito d
LEFT JOIN reporte r ON r.distrito_id = d.id
LEFT JOIN (
    SELECT reporte_id, AVG(estrellas)::numeric AS avg_estrellas, COUNT(*) AS n
    FROM calificacion
    GROUP BY reporte_id
) cal ON cal.reporte_id = r.id
GROUP BY GROUPING SETS ((d.id, d.nombre, r.categoria_id), (d.id, d.nombre))
-- Mantiene el agregado general (GROUPING=1) y las categorias reales;
-- descarta la fila de categoria NULL de distritos sin reportes (que
-- duplicaria al agregado general).
HAVING GROUPING(r.categoria_id) = 1 OR r.categoria_id IS NOT NULL;

-- Indice unico requerido por REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX ux_mv_indice_desempeno_id
    ON mv_indice_desempeno_distrital (id);
