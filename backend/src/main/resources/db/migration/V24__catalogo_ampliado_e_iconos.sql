-- ---------------------------------------------------------------------
-- V24 (US-34 y US-29 Esc. 1): catálogo ampliado de categorías estándar e
-- iconos de las estándar.
--
-- US-34: tres categorías estándar nuevas, las que nombra el backlog:
-- ciclovía, drenaje e iluminación. Son globales (distrito_id NULL),
-- activas y sin clase_modelo: el modelo de detección no las conoce, así que
-- nunca se sugieren (NC-04) y el ciudadano las elige a mano.
--
-- No rompen nada de lo que ya existe:
--   - la deduplicación de US-09 es por categoria_id: un reporte de una
--     categoría nueva solo se suma a otro de la misma;
--   - el índice de desempeño (mv_indice_desempeno_distrital, V21) agrupa por
--     la categoría de los reportes que existen: una categoría sin reportes no
--     agrega filas ni cambia los totales.
--
-- US-29 Esc. 1: la columna icono existe desde V19 y estaba nula. Aquí reciben
-- su icono las estándar; las personalizadas lo elige el funcionario. Los
-- valores son nombres de reportes/domain/IconoCategoria (conjunto cerrado).
-- ---------------------------------------------------------------------

-- Como en V18: ninguna categoría de un distrito puede llamarse ya como una
-- estándar nueva (el selector de ese distrito mostraría dos opciones
-- iguales). Si pasa, la migración se detiene y se renombra la del distrito.
DO $$
DECLARE
    choques TEXT;
BEGIN
    SELECT string_agg(format('«%s» (id %s, distrito_id %s)', nombre, id, distrito_id), ', ' ORDER BY id)
      INTO choques
      FROM categoria_dano
     WHERE lower(nombre) IN (lower('Ciclovía dañada'), lower('Drenaje obstruido'), lower('Iluminación deficiente'));

    IF choques IS NOT NULL THEN
        RAISE EXCEPTION 'V24: ya hay categorías con el nombre de una estándar nueva: %. '
            'Renómbralas antes de migrar (ver backend/README.md, «Catálogo ampliado (US-34)»).', choques;
    END IF;
END $$;

INSERT INTO categoria_dano (nombre, descripcion, es_estandar, distrito_id, activo, icono) VALUES
    ('Ciclovía dañada',        'Ciclovía con huecos, grietas, obstáculos o señalización borrada', TRUE, NULL, TRUE, 'CICLOVIA'),
    ('Drenaje obstruido',      'Sumidero, rejilla o cuneta tapada, rota o sin tapa',             TRUE, NULL, TRUE, 'DRENAJE'),
    ('Iluminación deficiente', 'Poste de alumbrado público apagado, intermitente o dañado',      TRUE, NULL, TRUE, 'ILUMINACION');

UPDATE categoria_dano SET icono = 'BACHE'        WHERE es_estandar AND nombre = 'Bache';
UPDATE categoria_dano SET icono = 'BACHE'        WHERE es_estandar AND nombre = 'Hueco en calzada';
UPDATE categoria_dano SET icono = 'VEREDA'       WHERE es_estandar AND nombre = 'Vereda dañada';
UPDATE categoria_dano SET icono = 'SEMAFORO'     WHERE es_estandar AND nombre = 'Semáforo averiado';
UPDATE categoria_dano SET icono = 'SENALIZACION' WHERE es_estandar AND nombre = 'Señalización faltante';
UPDATE categoria_dano SET icono = 'GRIETA'       WHERE es_estandar AND nombre = 'Pista deteriorada';

-- Toda estándar queda con icono; si alguna no, el nombre no era el esperado.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM categoria_dano WHERE es_estandar AND icono IS NULL) THEN
        RAISE EXCEPTION 'V24: hay categorías estándar sin icono; revisar los nombres de V3/V18.';
    END IF;
END $$;
