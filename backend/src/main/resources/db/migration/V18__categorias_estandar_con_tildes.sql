-- ---------------------------------------------------------------------
-- V18 (QA-1 M-1): tildes y eñes de las categorías estándar sembradas en V3.
--
-- V3 las sembró sin tildes («Vereda danada», «Semaforo averiado»,
-- «Senalizacion faltante») y así llegaban al mapa, a los filtros, al detalle,
-- a la bandeja y a la exportación. V3 ya está aplicada en todas las bases y
-- no se edita: la corrección va aquí (propuesta aceptada el 22/10,
-- project-context/decisions/propuestas/2026-10-22-tildes-categorias-estandar.md).
--
-- Los reportes guardan categoria_id, así que cambiar el texto no rompe
-- ninguna referencia. «Bache», «Hueco en calzada» y «Pista deteriorada» no
-- cambian; desactivar «Hueco en calzada» es de la migración de NC-04.
--
-- Cada UPDATE filtra por es_estandar y por el texto viejo: aplicada sobre una
-- base donde el texto ya cambió, no toca nada.
-- ---------------------------------------------------------------------

-- Antes de renombrar: ninguna categoría de distrito puede llamarse ya como
-- el nombre corregido. CategoriaDanoService.validarNombreDisponible compara
-- sin distinguir mayúsculas pero sí tildes, así que un distrito pudo crear
-- «Vereda dañada» mientras la estándar era «Vereda danada»; tras el UPDATE su
-- selector mostraría dos opciones iguales. Si pasa, la migración se detiene:
-- se renombra la categoría del distrito a mano (o se desactiva y renombra) y
-- se vuelve a arrancar. La comparación usa lower(), como upper() en la
-- consulta derivada del servicio.
DO $$
DECLARE
    choques TEXT;
BEGIN
    SELECT string_agg(format('«%s» (id %s, distrito_id %s)', nombre, id, distrito_id), ', ' ORDER BY id)
      INTO choques
      FROM categoria_dano
     WHERE NOT es_estandar
       AND lower(nombre) IN (lower('Vereda dañada'), lower('Semáforo averiado'), lower('Señalización faltante'));

    IF choques IS NOT NULL THEN
        RAISE EXCEPTION 'V18: hay categorías de distrito con el nombre corregido de una estándar: %. '
            'Renómbralas antes de migrar (ver backend/README.md, «Textos para el usuario»).', choques;
    END IF;
END $$;

UPDATE categoria_dano SET nombre = 'Vereda dañada'
 WHERE es_estandar AND nombre = 'Vereda danada';

UPDATE categoria_dano SET nombre = 'Semáforo averiado'
 WHERE es_estandar AND nombre = 'Semaforo averiado';

UPDATE categoria_dano SET nombre = 'Señalización faltante'
 WHERE es_estandar AND nombre = 'Senalizacion faltante';

UPDATE categoria_dano SET descripcion = 'Semáforo apagado o con mal funcionamiento'
 WHERE es_estandar AND descripcion = 'Semaforo apagado o con mal funcionamiento';

UPDATE categoria_dano SET descripcion = 'Señal de tránsito ausente o ilegible'
 WHERE es_estandar AND descripcion = 'Senal de transito ausente o ilegible';
