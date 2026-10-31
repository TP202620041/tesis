package pe.edu.upc.viasegura.reportes.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.reportes.domain.DenunciaReporte;
import pe.edu.upc.viasegura.reportes.domain.EstadoDenuncia;
import pe.edu.upc.viasegura.reportes.domain.MotivoDenuncia;

/** Acceso a datos de {@link DenunciaReporte} (NC-11a). */
public interface DenunciaReporteRepository extends JpaRepository<DenunciaReporte, Long> {

    boolean existsByReporteIdAndDenuncianteId(Long reporteId, Long denuncianteId);

    /** Tope diario: denuncias del ciudadano desde {@code desde} (las ultimas 24 h). */
    long countByDenuncianteIdAndCreatedAtAfter(Long denuncianteId, Instant desde);

    /** Detalle del ADMIN: todas las denuncias del reporte, de la mas antigua a la mas nueva. */
    List<DenunciaReporte> findByReporteIdOrderByCreatedAtAscIdAsc(Long reporteId);

    /**
     * Correos (en minusculas) de quienes denunciaron el reporte, en cualquier
     * estado: el motivo del ADMIN no puede contener ninguno (NC-11a).
     */
    @Query("""
            SELECT LOWER(u.email) FROM DenunciaReporte d JOIN d.denunciante u
            WHERE d.reporte.id = :reporteId
            """)
    List<String> correosDeDenunciantes(@Param("reporteId") Long reporteId);

    /** Fila de la bandeja del ADMIN: un reporte con sus denuncias en un estado. */
    interface FilaBandeja {
        Long getReporteId();

        long getTotal();

        Instant getPrimera();

        Instant getUltima();
    }

    /**
     * Bandeja del ADMIN: reportes con denuncias en {@code estado}, de mas a
     * menos denunciados y, entre iguales, del que espera hace mas. JPQL (y no
     * nativa) para que las fechas lleguen como {@code Instant}; el conteo va
     * aparte porque con {@code GROUP BY} Spring Data no puede derivarlo.
     */
    @Query(value = """
            SELECT d.reporte.id AS reporteId, COUNT(d) AS total,
                   MIN(d.createdAt) AS primera, MAX(d.createdAt) AS ultima
            FROM DenunciaReporte d
            WHERE d.estado = :estado
            GROUP BY d.reporte.id
            ORDER BY COUNT(d) DESC, MIN(d.createdAt) ASC, d.reporte.id ASC
            """,
            countQuery = """
            SELECT COUNT(DISTINCT d.reporte.id) FROM DenunciaReporte d WHERE d.estado = :estado
            """)
    Page<FilaBandeja> bandeja(@Param("estado") EstadoDenuncia estado, Pageable pageable);

    /**
     * Bandeja de ocultos (NC-11a2): el resumen de <b>todas</b> las denuncias
     * de cada reporte de la pagina, en cualquier estado. Los reportes sin
     * denuncias no devuelven fila.
     */
    @Query("""
            SELECT d.reporte.id AS reporteId, COUNT(d) AS total,
                   MIN(d.createdAt) AS primera, MAX(d.createdAt) AS ultima
            FROM DenunciaReporte d
            WHERE d.reporte.id IN :reporteIds
            GROUP BY d.reporte.id
            """)
    List<FilaBandeja> resumenEnCualquierEstado(@Param("reporteIds") Collection<Long> reporteIds);

    /** Conteo por motivo de las filas de una pagina de la bandeja. */
    interface ConteoPorMotivo {
        Long getReporteId();

        MotivoDenuncia getMotivo();

        long getTotal();
    }

    @Query("""
            SELECT d.reporte.id AS reporteId, d.motivo AS motivo, COUNT(d) AS total
            FROM DenunciaReporte d
            WHERE d.estado = :estado AND d.reporte.id IN :reporteIds
            GROUP BY d.reporte.id, d.motivo
            """)
    List<ConteoPorMotivo> conteoPorMotivo(@Param("estado") EstadoDenuncia estado,
                                          @Param("reporteIds") Collection<Long> reporteIds);

    /** Como {@link #conteoPorMotivo}, sin filtrar por estado (bandeja de ocultos, NC-11a2). */
    @Query("""
            SELECT d.reporte.id AS reporteId, d.motivo AS motivo, COUNT(d) AS total
            FROM DenunciaReporte d
            WHERE d.reporte.id IN :reporteIds
            GROUP BY d.reporte.id, d.motivo
            """)
    List<ConteoPorMotivo> conteoPorMotivoEnCualquierEstado(@Param("reporteIds") Collection<Long> reporteIds);

    /**
     * Resuelve las denuncias pendientes del reporte (las atiende al ocultar o
     * las desestima). Devuelve cuantas cambio.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            UPDATE denuncia_reporte
               SET estado = :estado, resuelta_por = :adminId, resuelta_en = :ahora,
                   motivo_resolucion = :motivo
             WHERE reporte_id = :reporteId AND estado = 'PENDIENTE'
            """, nativeQuery = true)
    int resolverPendientes(@Param("reporteId") Long reporteId,
                           @Param("estado") String estado,
                           @Param("adminId") Long adminId,
                           @Param("ahora") Instant ahora,
                           @Param("motivo") String motivo);

    /**
     * Gancho de BE-14 (cierre de cuenta, todavia no existe): deja las
     * denuncias del usuario sin denunciante. Las denuncias se conservan
     * mientras exista el reporte (decision del 28/10); lo que se borra es
     * quien las hizo.
     */
    @Modifying
    @Query(value = "UPDATE denuncia_reporte SET denunciante_id = NULL WHERE denunciante_id = :usuarioId",
            nativeQuery = true)
    int anonimizarDenunciante(@Param("usuarioId") Long usuarioId);
}
