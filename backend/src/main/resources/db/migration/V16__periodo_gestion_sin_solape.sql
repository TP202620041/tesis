-- ---------------------------------------------------------------------
-- V16 (NC-01): dos periodos de gestion no se solapan.
--
-- Cada fecha cae en un solo periodo, asi que un reporte nunca cuenta en
-- dos periodos ni en uno elegido en silencio (NC-02, NC-06). Las fechas
-- son inclusivas ('[]'). GiST sobre daterange no necesita btree_gist.
--
-- Va aparte de V15 porque V15 ya estaba aplicada (no se editan
-- migraciones aplicadas).
-- ---------------------------------------------------------------------
ALTER TABLE periodo_gestion
    ADD CONSTRAINT ex_periodo_gestion_sin_solape
        EXCLUDE USING gist (daterange(fecha_inicio, fecha_fin, '[]') WITH &&);
