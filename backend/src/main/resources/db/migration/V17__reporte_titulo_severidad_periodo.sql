-- ---------------------------------------------------------------------
-- V17 (NC-02): reporte.titulo, reporte.severidad y reporte.periodo_gestion_id
-- (ARCHITECTURE.md §8). Decisiones del usuario (20/10):
--
--   - titulo: obligatorio, 5-120 caracteres despues del trim. Los reportes
--     existentes se rellenan con "<categoria> en <distrito>".
--   - severidad: BAJA | MEDIA | ALTA, la fija el ciudadano. Los existentes
--     quedan en MEDIA.
--   - periodo_gestion_id: el periodo que contiene la fecha de creacion (en
--     hora de Lima). Nulo si el reporte cae fuera de todo periodo.
--
-- Primero se agregan nulables, se rellenan y recien despues pasan a NOT NULL,
-- para que la migracion funcione sobre una base con datos.
-- ---------------------------------------------------------------------
ALTER TABLE reporte
    ADD COLUMN titulo             VARCHAR(120),
    ADD COLUMN severidad          VARCHAR(10),
    ADD COLUMN periodo_gestion_id BIGINT REFERENCES periodo_gestion (id);

-- Un reporte sin distrito no deberia existir (fuera de Lima es 409), pero la
-- columna es nulable desde V1: en ese caso se usa "Lima Metropolitana".
-- El distrito va en subconsulta: un JOIN en el FROM no puede referirse a r.
UPDATE reporte r
   SET titulo = LEFT(c.nombre || ' en ' || COALESCE(
           (SELECT d.nombre FROM distrito d WHERE d.id = r.distrito_id), 'Lima Metropolitana'), 120)
  FROM categoria_dano c
 WHERE c.id = r.categoria_id;

UPDATE reporte SET severidad = 'MEDIA';

UPDATE reporte r
   SET periodo_gestion_id = p.id
  FROM periodo_gestion p
 WHERE (r.created_at AT TIME ZONE 'America/Lima')::date BETWEEN p.fecha_inicio AND p.fecha_fin;

ALTER TABLE reporte
    ALTER COLUMN titulo SET NOT NULL,
    ALTER COLUMN severidad SET NOT NULL,
    ADD CONSTRAINT ck_reporte_titulo_largo CHECK (char_length(btrim(titulo)) BETWEEN 5 AND 120),
    ADD CONSTRAINT ck_reporte_severidad CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA'));

-- Para los KPIs por periodo (NC-06).
CREATE INDEX idx_reporte_periodo_gestion ON reporte (periodo_gestion_id);
