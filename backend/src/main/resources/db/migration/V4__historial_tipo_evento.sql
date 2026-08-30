-- ---------------------------------------------------------------------
-- V4 (US-15): historial_estado_reporte pasa a ser la linea de tiempo
-- UNICA de la gestion municipal. Se agrega tipo_evento para distinguir
-- un cambio de estado (US-14) de una asignacion de responsable (US-15),
-- de modo que la trazabilidad completa se lea con un solo SELECT y el
-- modelo se explique solo (sin filas "sin cambio de estado" ambiguas).
-- ---------------------------------------------------------------------

-- Discriminador. Las filas existentes (todas cambios de estado) toman el
-- default, por lo que la migracion no rompe datos ya sembrados.
ALTER TABLE historial_estado_reporte
    ADD COLUMN tipo_evento VARCHAR(20) NOT NULL DEFAULT 'CAMBIO_ESTADO';

-- estado_nuevo deja de ser NOT NULL a nivel de columna: una ASIGNACION no
-- representa un estado (estado_anterior y estado_nuevo van NULL). La
-- invariante original ("un cambio de estado siempre tiene estado_nuevo") se
-- preserva con el CHECK condicional de abajo, no relajandola.
ALTER TABLE historial_estado_reporte
    ALTER COLUMN estado_nuevo DROP NOT NULL;

ALTER TABLE historial_estado_reporte
    ADD CONSTRAINT ck_historial_tipo_evento
        CHECK (tipo_evento IN ('CAMBIO_ESTADO', 'ASIGNACION'));

-- Integridad por tipo: un CAMBIO_ESTADO exige estado_nuevo; una ASIGNACION
-- exige ambos estados NULL (su dato vive en asignacion_responsable y su
-- descripcion en el comentario).
ALTER TABLE historial_estado_reporte
    ADD CONSTRAINT ck_historial_evento_coherente CHECK (
        (tipo_evento = 'CAMBIO_ESTADO' AND estado_nuevo IS NOT NULL)
        OR (tipo_evento = 'ASIGNACION' AND estado_anterior IS NULL AND estado_nuevo IS NULL)
    );
