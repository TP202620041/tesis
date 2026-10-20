package pe.edu.upc.viasegura.reportes.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
