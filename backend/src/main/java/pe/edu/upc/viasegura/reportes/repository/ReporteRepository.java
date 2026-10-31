package pe.edu.upc.viasegura.reportes.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;

/** Acceso a datos de {@link Reporte} (patron Repository). */
public interface ReporteRepository extends JpaRepository<Reporte, Long> {

    /**
     * Bandeja municipal (US-13): reportes de un distrito, con filtros
     * opcionales por estado y categoria (US-12 parcial). Los parametros
     * nulos no filtran.
     */
    @Query("""
            SELECT r FROM Reporte r
            WHERE r.distrito.id = :distritoId
              AND (:estado IS NULL OR r.estado = :estado)
              AND (:categoriaId IS NULL OR r.categoria.id = :categoriaId)
              AND r.oculto = false
            ORDER BY r.createdAt DESC
            """)
    List<Reporte> findBandeja(
            @Param("distritoId") Long distritoId,
            @Param("estado") EstadoReporte estado,
            @Param("categoriaId") Long categoriaId);

    /**
     * Reporte ACTIVO mas cercano de la misma categoria dentro de un radio
     * (metros) alrededor de un punto (US-09, acumulacion de duplicados).
     *
     * <p>"Activo" = estado no terminal (distinto de RESUELTO/RECHAZADO/CANCELADO).
     * {@code ST_DWithin} sobre {@code geography} usa el indice GiST
     * {@code ix_reporte_ubicacion_gist}; se ordena por distancia para
     * adherirse al mas proximo.</p>
     */
    @Query(value = """
            SELECT * FROM reporte r
            WHERE r.categoria_id = :categoriaId
              AND r.estado NOT IN ('RESUELTO', 'RECHAZADO', 'CANCELADO')
              AND NOT r.oculto
              AND ST_DWithin(r.ubicacion,
                             ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                             :radioMetros)
            ORDER BY ST_Distance(r.ubicacion,
                                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) ASC
            LIMIT 1
            """, nativeQuery = true)
    Optional<Reporte> findReporteActivoCercano(
            @Param("lon") double lon,
            @Param("lat") double lat,
            @Param("categoriaId") long categoriaId,
            @Param("radioMetros") double radioMetros);

    /**
     * US-26 (Escenario 2): reportes del ciudadano resueltos hace mas de 3
     * dias (resolved_at anterior a {@code limite}) que aun no ha calificado.
     * Alimenta el recordatorio no intrusivo de calificacion pendiente,
     * resuelto como consulta bajo demanda (no hay canal de notificacion para
     * recordatorios en la tabla notificacion actual).
     */
    @Query("""
            SELECT r FROM Reporte r
            WHERE r.creador.id = :creadorId
              AND r.estado = pe.edu.upc.viasegura.reportes.domain.EstadoReporte.RESUELTO
              AND r.resolvedAt IS NOT NULL
              AND r.resolvedAt < :limite
              AND NOT EXISTS (
                  SELECT 1 FROM Calificacion c
                  WHERE c.reporte = r AND c.usuario.id = :creadorId)
            ORDER BY r.resolvedAt ASC
            """)
    List<Reporte> findPendientesDeCalificacion(
            @Param("creadorId") Long creadorId,
            @Param("limite") Instant limite);

    /**
     * US-07: reportes que el ciudadano envio (es CREADOR), mas recientes
     * primero. No incluye reportes donde solo es ADHERIDO -- el backlog dice
     * "reportes que he enviado", a diferencia de US-22 (historial), que si
     * es visible para el adherido por ser el afectado de un reporte ajeno.
     */
    List<Reporte> findByCreadorIdOrderByCreatedAtDesc(Long creadorId);

    /**
     * US-12: busqueda publica paginada por distrito, categoria, estado y
     * rango de fechas. Todos los filtros son opcionales (parametro null =
     * no filtra).
     *
     * <p><b>Los CANCELADO se excluyen salvo que se pidan explicitamente</b>
     * con {@code estado=CANCELADO}. Un reporte cancelado es uno que el
     * propio ciudadano retiro estando PENDIENTE (US-08): nunca entro al
     * flujo municipal y puede que el dano ni siquiera exista, asi que
     * mostrarlo en el mapa publico (US-10) desinformaria sobre el estado
     * real de las calles. Es el mismo criterio ya aplicado en la vista
     * materializada de desempeno (migracion V7), que tampoco los cuenta.
     * RECHAZADO si se muestra: ahi la municipalidad decidio activamente y
     * esa decision es informacion publica de transparencia.</p>
     */
    @Query(value = """
            SELECT * FROM reporte r
            WHERE (CAST(:distritoId AS bigint) IS NULL OR r.distrito_id = :distritoId)
              AND (CAST(:categoriaId AS bigint) IS NULL OR r.categoria_id = :categoriaId)
              AND (CAST(:estado AS varchar) IS NULL OR r.estado = :estado)
              AND (CAST(:estado AS varchar) IS NOT NULL OR r.estado <> 'CANCELADO')
              AND NOT r.oculto
              AND (CAST(:fechaDesde AS timestamptz) IS NULL OR r.created_at >= :fechaDesde)
              AND (CAST(:fechaHasta AS timestamptz) IS NULL OR r.created_at <= :fechaHasta)
            ORDER BY r.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM reporte r
            WHERE (CAST(:distritoId AS bigint) IS NULL OR r.distrito_id = :distritoId)
              AND (CAST(:categoriaId AS bigint) IS NULL OR r.categoria_id = :categoriaId)
              AND (CAST(:estado AS varchar) IS NULL OR r.estado = :estado)
              AND (CAST(:estado AS varchar) IS NOT NULL OR r.estado <> 'CANCELADO')
              AND NOT r.oculto
              AND (CAST(:fechaDesde AS timestamptz) IS NULL OR r.created_at >= :fechaDesde)
              AND (CAST(:fechaHasta AS timestamptz) IS NULL OR r.created_at <= :fechaHasta)
            """,
            nativeQuery = true)
    Page<Reporte> buscar(
            @Param("distritoId") Long distritoId,
            @Param("categoriaId") Long categoriaId,
            @Param("estado") String estado,
            @Param("fechaDesde") Instant fechaDesde,
            @Param("fechaHasta") Instant fechaHasta,
            Pageable pageable);

    /**
     * US-10: igual que {@link #buscar}, mas un area rectangular obligatoria
     * (bounding box del mapa). Metodo APARTE (no el mismo con params de
     * bbox nullable) porque PostgreSQL no puede determinar el tipo de un
     * parametro nativo que SOLO aparece dentro de una funcion PostGIS
     * ({@code ST_MakeEnvelope}) cuando ese parametro tambien puede venir
     * null ("could not determine data type of parameter"): al ser
     * obligatorios aqui (el servicio ya valido que las 4 coordenadas vienen
     * juntas o ninguna, y solo llama a este metodo con las 4 presentes),
     * Postgres infiere el tipo sin ambiguedad. Reutiliza el indice GiST de
     * {@code ubicacion} igual que el resto de consultas espaciales del
     * repo; nativa por el mismo motivo que ellas (PostGIS no es portable a
     * JPQL/HQL en este proyecto).
     */
    @Query(value = """
            SELECT * FROM reporte r
            WHERE (CAST(:distritoId AS bigint) IS NULL OR r.distrito_id = :distritoId)
              AND (CAST(:categoriaId AS bigint) IS NULL OR r.categoria_id = :categoriaId)
              AND (CAST(:estado AS varchar) IS NULL OR r.estado = :estado)
              AND (CAST(:estado AS varchar) IS NOT NULL OR r.estado <> 'CANCELADO')
              AND NOT r.oculto
              AND (CAST(:fechaDesde AS timestamptz) IS NULL OR r.created_at >= :fechaDesde)
              AND (CAST(:fechaHasta AS timestamptz) IS NULL OR r.created_at <= :fechaHasta)
              AND ST_Within(r.ubicacion::geometry,
                    ST_MakeEnvelope(:minLon, :minLat, :maxLon, :maxLat, 4326))
            ORDER BY r.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM reporte r
            WHERE (CAST(:distritoId AS bigint) IS NULL OR r.distrito_id = :distritoId)
              AND (CAST(:categoriaId AS bigint) IS NULL OR r.categoria_id = :categoriaId)
              AND (CAST(:estado AS varchar) IS NULL OR r.estado = :estado)
              AND (CAST(:estado AS varchar) IS NOT NULL OR r.estado <> 'CANCELADO')
              AND NOT r.oculto
              AND (CAST(:fechaDesde AS timestamptz) IS NULL OR r.created_at >= :fechaDesde)
              AND (CAST(:fechaHasta AS timestamptz) IS NULL OR r.created_at <= :fechaHasta)
              AND ST_Within(r.ubicacion::geometry,
                    ST_MakeEnvelope(:minLon, :minLat, :maxLon, :maxLat, 4326))
            """,
            nativeQuery = true)
    Page<Reporte> buscarEnArea(
            @Param("distritoId") Long distritoId,
            @Param("categoriaId") Long categoriaId,
            @Param("estado") String estado,
            @Param("fechaDesde") Instant fechaDesde,
            @Param("fechaHasta") Instant fechaHasta,
            @Param("minLon") double minLon,
            @Param("minLat") double minLat,
            @Param("maxLon") double maxLon,
            @Param("maxLat") double maxLat,
            Pageable pageable);

    /**
     * US-28: reportes del distrito del funcionario para exportar, con los
     * mismos filtros opcionales de US-12/bandeja (categoria, estado,
     * fechas). Nativa: aunque {@code findBandeja} (JPQL) resuelve bien el
     * mismo patron {@code (:param IS NULL OR ...)} para Long/enum, con
     * parametros {@code Instant} el traductor JPQL de Hibernate 6 deja el
     * "IS NULL" aislado sin tipo resuelto y Postgres lo rechaza (mismo
     * sintoma que en las consultas nativas de US-12/US-10) -- se opta por
     * nativa + CAST explicito en las 4, consistente con el fix ya probado.
     */
    @Query(value = """
            SELECT * FROM reporte r
            WHERE r.distrito_id = :distritoId
              AND NOT r.oculto
              AND (CAST(:categoriaId AS bigint) IS NULL OR r.categoria_id = :categoriaId)
              AND (CAST(:estado AS varchar) IS NULL OR r.estado = :estado)
              AND (CAST(:fechaDesde AS timestamptz) IS NULL OR r.created_at >= :fechaDesde)
              AND (CAST(:fechaHasta AS timestamptz) IS NULL OR r.created_at <= :fechaHasta)
            ORDER BY r.created_at DESC
            """, nativeQuery = true)
    List<Reporte> buscarParaExportar(
            @Param("distritoId") Long distritoId,
            @Param("categoriaId") Long categoriaId,
            @Param("estado") String estado,
            @Param("fechaDesde") Instant fechaDesde,
            @Param("fechaHasta") Instant fechaHasta);

    /**
     * US-17: reportes en gestion activa (RECIBIDO/EN_PROCESO) del distrito
     * sin responsable vigente asignado. Metrica interna (no forma parte del
     * indice publico de transparencia US-18): es una senal operativa para
     * el funcionario, no un dato que la municipalidad publicaria.
     */
    @Query("""
            SELECT COUNT(r) FROM Reporte r
            WHERE r.distrito.id = :distritoId
              AND r.estado IN (pe.edu.upc.viasegura.reportes.domain.EstadoReporte.RECIBIDO,
                                pe.edu.upc.viasegura.reportes.domain.EstadoReporte.EN_PROCESO)
              AND NOT EXISTS (
                  SELECT 1 FROM AsignacionResponsable a
                  WHERE a.reporte = r AND a.activo = true)
              AND r.oculto = false
            """)
    long countSinResponsable(@Param("distritoId") Long distritoId);

    /**
     * US-17: reportes no terminales cuyo estado no se actualiza hace mas de
     * {@code limite} (senal de reportes desatendidos). Usa {@code updatedAt}
     * (ya se refresca en cada {@code cambiarEstado}) en vez de reconstruir la
     * fecha desde el historial, que tiene el mismo dato de forma mas directa.
     */
    @Query("""
            SELECT COUNT(r) FROM Reporte r
            WHERE r.distrito.id = :distritoId
              AND r.estado NOT IN (pe.edu.upc.viasegura.reportes.domain.EstadoReporte.RESUELTO,
                                    pe.edu.upc.viasegura.reportes.domain.EstadoReporte.RECHAZADO,
                                    pe.edu.upc.viasegura.reportes.domain.EstadoReporte.CANCELADO)
              AND r.updatedAt < :limite
              AND r.oculto = false
            """)
    long countEstancados(@Param("distritoId") Long distritoId, @Param("limite") Instant limite);

    /** Fila de {@link #densidadEnGrilla}: un punto de la grilla y cuantos reportes caen en el. */
    interface CeldaDensidad {
        double getLatitud();

        double getLongitud();

        long getCantidad();
    }

    /**
     * US-11: reportes agrupados en una grilla de {@code celda} grados para el
     * mapa de calor, con los MISMOS filtros y la misma regla de visibilidad
     * que {@link #buscar} (sin {@code estado}, todo salvo CANCELADO).
     *
     * <p>{@code ST_SnapToGrid} sobre el {@code geometry} (lon/lat en grados)
     * lleva cada punto al nodo mas cercano de la grilla, y se cuenta por nodo.
     * Agrupar en la base, y no devolver los puntos, acota la respuesta al
     * numero de celdas ocupadas. {@code celda} nunca es nulo, asi que
     * Postgres infiere su tipo sin {@code CAST}; los filtros opcionales usan
     * el mismo {@code CAST(:p AS tipo) IS NULL} que {@link #buscar}.</p>
     */
    @Query(value = """
            SELECT ST_Y(g.punto) AS latitud, ST_X(g.punto) AS longitud, g.cantidad AS cantidad
            FROM (
                SELECT ST_SnapToGrid(r.ubicacion::geometry, :celda) AS punto, COUNT(*) AS cantidad
                FROM reporte r
                WHERE (CAST(:distritoId AS bigint) IS NULL OR r.distrito_id = :distritoId)
                  AND (CAST(:categoriaId AS bigint) IS NULL OR r.categoria_id = :categoriaId)
                  AND (CAST(:estado AS varchar) IS NULL OR r.estado = :estado)
                  AND (CAST(:estado AS varchar) IS NOT NULL OR r.estado <> 'CANCELADO')
              AND NOT r.oculto
                  AND (CAST(:fechaDesde AS timestamptz) IS NULL OR r.created_at >= :fechaDesde)
                  AND (CAST(:fechaHasta AS timestamptz) IS NULL OR r.created_at <= :fechaHasta)
                GROUP BY 1
            ) g
            ORDER BY g.cantidad DESC, latitud ASC, longitud ASC
            """, nativeQuery = true)
    List<CeldaDensidad> densidadEnGrilla(
            @Param("celda") double celda,
            @Param("distritoId") Long distritoId,
            @Param("categoriaId") Long categoriaId,
            @Param("estado") String estado,
            @Param("fechaDesde") Instant fechaDesde,
            @Param("fechaHasta") Instant fechaHasta);

    /**
     * NC-04: URL relativa de la foto del reporte, o vacio si no tiene (o si el
     * reporte no existe). Solo la columna: la sugerencia oficial corre fuera
     * de toda transaccion y no necesita la entidad.
     */
    @Query("SELECT r.fotoUrl FROM Reporte r WHERE r.id = :id")
    Optional<String> findFotoUrlById(@Param("id") Long id);

    /**
     * NC-04 (D-08): escribe la sugerencia oficial <b>una sola vez</b>. El
     * {@code WHERE} exige que las columnas sigan nulas, asi que un segundo
     * intento (otro evento, un reproceso) no pisa la primera; devuelve las
     * filas actualizadas (0 o 1).
     *
     * <p>SQL nativo y no {@code save()}: escribe solo estas tres columnas, sin
     * cargar la entidad, sin tocar el resto de la fila (un {@code merge}
     * podria devolver a su valor viejo un estado que el funcionario cambio
     * mientras tanto) y sin mover {@code updated_at}: la sugerencia es una
     * senal interna y no debe notarse en ninguna fecha visible.</p>
     */
    @Modifying
    @Query(value = """
            UPDATE reporte
               SET categoria_sugerida_id = :categoriaId,
                   confianza_sugerencia = :confianza,
                   version_modelo_sugerencia = :versionModelo
             WHERE id = :reporteId
               AND categoria_sugerida_id IS NULL
               AND confianza_sugerencia IS NULL
               AND version_modelo_sugerencia IS NULL
            """, nativeQuery = true)
    int registrarSugerencia(
            @Param("reporteId") Long reporteId,
            @Param("categoriaId") Long categoriaId,
            @Param("confianza") BigDecimal confianza,
            @Param("versionModelo") String versionModelo);

    /*
     * Moderacion (NC-11a, D-15). Un reporte oculto sale de la busqueda, del
     * area, de la densidad, de la deduplicacion, de la bandeja municipal, de
     * sus conteos (US-17) y de la exportacion: todas esas consultas llevan
     * `NOT r.oculto`. Una regla de visibilidad nueva va en todas ellas.
     */

    /** {@code true} si el reporte existe y esta oculto (comentarios publicos, NC-11a). */
    boolean existsByIdAndOcultoTrue(Long id);

    /** Fila de la bandeja de ocultos del ADMIN (NC-11a2): el reporte y cuando se oculto. */
    interface FilaOcultos {
        Long getReporteId();

        /** Fecha del ultimo ocultamiento todavia vigente; {@code null} si no quedo en el historial. */
        Instant getOcultadoEn();
    }

    /**
     * Bandeja de ocultos del ADMIN (NC-11a2): los reportes con el reporte o la
     * foto ocultos, tengan denuncias o no, <b>lo ocultado mas recientemente
     * primero</b>. La fecha sale del historial (el {@code REPORTE_OCULTO} o
     * {@code FOTO_OCULTA} mas reciente cuyo alcance siga oculto) y no de
     * {@code updated_at}, porque ocultar no lo mueve a proposito (mide los
     * estancados de US-17) y porque un cambio de estado del funcionario si lo
     * moveria. Consulta aparte de la de denuncias: sin parametros opcionales
     * (ver CLAUDE.md). Sin indice nuevo: el WHERE recorre {@code reporte}
     * completa (aceptable a esta escala y solo para el ADMIN); si la tabla
     * creciera, un indice parcial {@code WHERE oculto OR foto_oculta}. El JOIN
     * al historial usa {@code ix_historial_reporte}.
     */
    @Query(value = """
            SELECT r.id AS reporteId, MAX(h.createdAt) AS ocultadoEn
            FROM Reporte r
            LEFT JOIN HistorialEstadoReporte h
                   ON h.reporte = r
                  AND ((h.tipoEvento = pe.edu.upc.viasegura.reportes.domain.TipoEventoHistorial.REPORTE_OCULTO
                        AND r.oculto = true)
                    OR (h.tipoEvento = pe.edu.upc.viasegura.reportes.domain.TipoEventoHistorial.FOTO_OCULTA
                        AND r.fotoOculta = true))
            WHERE r.oculto = true OR r.fotoOculta = true
            GROUP BY r.id
            ORDER BY MAX(h.createdAt) DESC NULLS LAST, r.id DESC
            """,
            countQuery = "SELECT COUNT(r) FROM Reporte r WHERE r.oculto = true OR r.fotoOculta = true")
    Page<FilaOcultos> ocultosParaModeracion(Pageable pageable);

    /**
     * Resolver de {@code /media/fotos/reportes/**} (D-15, opcion A): la foto se
     * sirve solo si es de un reporte visible con la foto visible. Una foto sin
     * reporte (huerfana) tampoco. Usa {@code ix_reporte_foto_url} (V21).
     */
    @Query("""
            SELECT COUNT(r) > 0 FROM Reporte r
            WHERE r.fotoUrl = :fotoUrl AND r.oculto = false AND r.fotoOculta = false
            """)
    boolean existeFotoVisible(@Param("fotoUrl") String fotoUrl);

    /**
     * Oculta o restablece el reporte entero, <b>solo si cambia</b>: devuelve 0
     * si ya estaba en {@code oculto} (el servicio responde 409) y 1 si lo
     * cambio. El {@code UPDATE} condicional serializa a dos ADMIN simultaneos
     * sin duplicar la entrada del historial. No toca {@code updated_at}: la
     * moderacion no debe hacer que un reporte estancado parezca atendido
     * (US-17). Limpia el contexto para que la entidad se relea con el valor nuevo.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "UPDATE reporte SET oculto = :oculto WHERE id = :id AND oculto <> :oculto",
            nativeQuery = true)
    int cambiarOculto(@Param("id") Long id, @Param("oculto") boolean oculto);

    /** Como {@link #cambiarOculto}, solo para la foto; exige que el reporte tenga foto. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            UPDATE reporte SET foto_oculta = :oculta
             WHERE id = :id AND foto_oculta <> :oculta AND foto_url IS NOT NULL
            """, nativeQuery = true)
    int cambiarFotoOculta(@Param("id") Long id, @Param("oculta") boolean oculta);
}
