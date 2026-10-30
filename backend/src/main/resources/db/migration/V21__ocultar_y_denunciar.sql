-- ---------------------------------------------------------------------
-- V21 (NC-11a, D-15): el ADMIN oculta reportes y fotos, y los ciudadanos
-- denuncian reportes. Diseno: propuestas/2026-10-28-moderacion-de-contenido.md
-- (seccion 6), decidido por el usuario el 28/10.
--
-- 1. reporte.oculto y reporte.foto_oculta, por separado: ocultar la foto no
--    saca al reporte de nada; ocultar el reporte lo saca de todo lo publico,
--    de la bandeja municipal y del indice.
-- 2. Cuatro tipos de evento en la linea de tiempo unica (V4), sin estados y
--    con el motivo obligatorio.
-- 3. denuncia_reporte: una por ciudadano y reporte. Las denuncias no ocultan
--    nada por si solas (SEC-01): solo ponen el reporte en la bandeja del ADMIN.
-- 4. El indice de desempeno se vuelve a crear como en V7, sin los reportes
--    ocultos (decision del usuario del 28/10).
-- ---------------------------------------------------------------------

-- 1. Visibilidad. NOT NULL DEFAULT FALSE: los reportes existentes quedan visibles.
ALTER TABLE reporte
    ADD COLUMN oculto      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN foto_oculta BOOLEAN NOT NULL DEFAULT FALSE;

-- El resolver de /media/fotos/reportes/** pregunta por la URL en cada foto que
-- llega al origen (FotosDeReporteWebConfig).
CREATE INDEX ix_reporte_foto_url ON reporte (foto_url);

-- 2. Linea de tiempo: los tipos nuevos caben en VARCHAR(20). Se reemplazan los
-- dos CHECK de V4; los dos tipos de siempre conservan su regla.
ALTER TABLE historial_estado_reporte DROP CONSTRAINT ck_historial_tipo_evento;
ALTER TABLE historial_estado_reporte DROP CONSTRAINT ck_historial_evento_coherente;

ALTER TABLE historial_estado_reporte
    ADD CONSTRAINT ck_historial_tipo_evento CHECK (tipo_evento IN (
        'CAMBIO_ESTADO', 'ASIGNACION',
        'FOTO_OCULTA', 'REPORTE_OCULTO', 'FOTO_RESTABLECIDA', 'REPORTE_RESTABLECIDO'));

ALTER TABLE historial_estado_reporte
    ADD CONSTRAINT ck_historial_evento_coherente CHECK (
        (tipo_evento = 'CAMBIO_ESTADO' AND estado_nuevo IS NOT NULL)
        OR (tipo_evento = 'ASIGNACION' AND estado_anterior IS NULL AND estado_nuevo IS NULL)
        OR (tipo_evento IN ('FOTO_OCULTA', 'REPORTE_OCULTO', 'FOTO_RESTABLECIDA', 'REPORTE_RESTABLECIDO')
            AND estado_anterior IS NULL AND estado_nuevo IS NULL
            AND comentario IS NOT NULL AND btrim(comentario) <> '')
    );

-- 3. Denuncias.
--
-- denunciante_id admite NULL a proposito: es el gancho de BE-14 (cierre de
-- cuenta), que anonimiza al denunciante sin borrar la denuncia (se conserva
-- mientras exista el reporte). Mientras BE-14 no exista, el servicio siempre
-- lo llena. Dos NULL no chocan en el UNIQUE, como corresponde a dos cuentas
-- cerradas distintas.
CREATE TABLE denuncia_reporte (
    id                BIGSERIAL PRIMARY KEY,
    reporte_id        BIGINT       NOT NULL REFERENCES reporte (id),
    denunciante_id    BIGINT       REFERENCES usuario (id),
    motivo            VARCHAR(20)  NOT NULL,
    detalle           VARCHAR(500),
    estado            VARCHAR(12)  NOT NULL DEFAULT 'PENDIENTE',
    resuelta_por      BIGINT       REFERENCES usuario (id),
    resuelta_en       TIMESTAMPTZ,
    -- Lo que escribio el ADMIN al atenderla (el motivo de ocultar) o al
    -- desestimarla. Solo lo leen los DTO del ADMIN.
    motivo_resolucion VARCHAR(500),
    created_at        TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_denuncia_reporte_usuario UNIQUE (reporte_id, denunciante_id),
    CONSTRAINT ck_denuncia_motivo CHECK (motivo IN
        ('CONTENIDO_SEXUAL', 'OFENSIVO', 'DATOS_PERSONALES', 'FALSO', 'OTRO')),
    CONSTRAINT ck_denuncia_estado CHECK (estado IN ('PENDIENTE', 'ATENDIDA', 'DESESTIMADA')),
    CONSTRAINT ck_denuncia_resuelta CHECK ((estado = 'PENDIENTE') = (resuelta_en IS NULL))
);

-- Bandeja del ADMIN: denuncias pendientes por reporte.
CREATE INDEX ix_denuncia_pendiente ON denuncia_reporte (reporte_id) WHERE estado = 'PENDIENTE';
-- Tope diario por ciudadano (app.moderacion.denuncias-por-dia).
CREATE INDEX ix_denuncia_denunciante_fecha ON denuncia_reporte (denunciante_id, created_at);

-- 4. Indice de desempeno, igual que en V7 mas `AND NOT r.oculto` en el JOIN de
-- reporte. El filtro va en la condicion del JOIN (no en WHERE) para conservar
-- el LEFT JOIN y los distritos sin reportes. Las calificaciones se unen a
-- traves de r, asi que las de un reporte oculto tampoco cuentan. foto_oculta
-- no entra: ocultar solo la foto no mueve el indice.
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
LEFT JOIN reporte r ON r.distrito_id = d.id AND r.estado <> 'CANCELADO' AND NOT r.oculto
LEFT JOIN (
    SELECT reporte_id, AVG(estrellas)::numeric AS avg_estrellas, COUNT(*) AS n
    FROM calificacion
    GROUP BY reporte_id
) cal ON cal.reporte_id = r.id
GROUP BY GROUPING SETS ((d.id, d.nombre, r.categoria_id), (d.id, d.nombre))
HAVING GROUPING(r.categoria_id) = 1 OR r.categoria_id IS NOT NULL;

-- Indice unico requerido por REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX ux_mv_indice_desempeno_id
    ON mv_indice_desempeno_distrital (id);
