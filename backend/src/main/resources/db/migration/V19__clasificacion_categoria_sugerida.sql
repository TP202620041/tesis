-- ---------------------------------------------------------------------
-- V19 (NC-04, fase 0): sugerencia de categoría por la foto (D-08).
-- Propuesta aceptada el 21/10:
-- project-context/decisions/propuestas/2026-10-21-ml-clases-modelo.md
--
--   categoria_dano.clase_modelo  clase del modelo de detección que le
--                                corresponde (vocabulario del contrato /v1 de
--                                inferencia/): Bache -> bache, Pista
--                                deteriorada -> grieta; el resto nulo y nunca
--                                se sugiere. Única cuando no es nula (un
--                                UNIQUE de PostgreSQL admite varios NULL) y
--                                solo en categorías estándar: las de un
--                                distrito (US-29) nunca se sugieren.
--   categoria_dano.icono         ARCHITECTURE.md §8; su contenido lo define el
--                                rediseño (S8). Nulo por ahora.
--   reporte.categoria_sugerida_id, confianza_sugerencia (0..1, 3 decimales),
--   version_modelo_sugerencia    la sugerencia oficial que escribe UNA vez el
--                                listener asíncrono. Las tres juntas: o todas
--                                nulas o todas con valor. Señal interna: no va
--                                en ningún DTO.
--
-- Y desactiva la categoría estándar «Hueco en calzada» (decisión del 21/10):
-- en una foto no se distingue de «Bache» (la profundidad no se ve), y con dos
-- nombres para el mismo daño la deduplicación de US-09, que es por categoría,
-- deja crear dos reportes del mismo hueco. La gravedad la expresa la
-- severidad (NC-02). Los reportes que ya la usan no cambian: guardan
-- categoria_id y una categoría inactiva se sigue mostrando; solo deja de
-- ofrecerse al crear (ReporteService rechaza una inactiva con 409).
-- ---------------------------------------------------------------------

ALTER TABLE categoria_dano
    ADD COLUMN clase_modelo VARCHAR(40),
    ADD COLUMN icono        VARCHAR(40),
    ADD CONSTRAINT uq_categoria_dano_clase_modelo UNIQUE (clase_modelo),
    ADD CONSTRAINT ck_categoria_dano_clase_modelo_estandar CHECK (clase_modelo IS NULL OR es_estandar);

UPDATE categoria_dano SET clase_modelo = 'bache'
 WHERE es_estandar AND nombre = 'Bache';

UPDATE categoria_dano SET clase_modelo = 'grieta'
 WHERE es_estandar AND nombre = 'Pista deteriorada';

UPDATE categoria_dano SET activo = FALSE
 WHERE es_estandar AND nombre = 'Hueco en calzada';

-- Las categorías estándar no se editan por el API (US-29), así que los
-- nombres son los de V3. Si alguno no aparece, la migración se detiene en vez
-- de dejar el clasificador sin categorías que sugerir sin que nadie lo note.
DO $$
BEGIN
    IF (SELECT count(*) FROM categoria_dano WHERE clase_modelo IN ('bache', 'grieta')) <> 2 THEN
        RAISE EXCEPTION 'V19: no se encontraron las categorías estándar «Bache» y «Pista deteriorada».';
    END IF;
END $$;

ALTER TABLE reporte
    ADD COLUMN categoria_sugerida_id     BIGINT REFERENCES categoria_dano (id),
    ADD COLUMN confianza_sugerencia      NUMERIC(4, 3),
    ADD COLUMN version_modelo_sugerencia VARCHAR(40),
    ADD CONSTRAINT ck_reporte_confianza_sugerencia CHECK (confianza_sugerencia BETWEEN 0 AND 1),
    ADD CONSTRAINT ck_reporte_sugerencia_completa CHECK (
        (categoria_sugerida_id IS NULL AND confianza_sugerencia IS NULL AND version_modelo_sugerencia IS NULL)
        OR (categoria_sugerida_id IS NOT NULL AND confianza_sugerencia IS NOT NULL
            AND version_modelo_sugerencia IS NOT NULL));
