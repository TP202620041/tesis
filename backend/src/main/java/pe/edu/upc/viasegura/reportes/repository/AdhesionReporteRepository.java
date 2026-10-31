package pe.edu.upc.viasegura.reportes.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.reportes.domain.AdhesionReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;

/** Acceso a datos de {@link AdhesionReporte} (US-09). */
public interface AdhesionReporteRepository extends JpaRepository<AdhesionReporte, Long> {

    boolean existsByReporteIdAndUsuarioId(Long reporteId, Long usuarioId);

    /**
     * QA-1 M-6: reportes a los que el usuario se adhirio sin ser su creador
     * (el creador tambien tiene fila en {@code adhesion_reporte}), del apoyo
     * mas reciente al mas antiguo. Todos los estados, como mis-reportes,
     * salvo los que oculto el ADMIN (NC-11a): esos solo los ve su creador.
     */
    @Query("""
            SELECT a.reporte FROM AdhesionReporte a
            WHERE a.usuario.id = :usuarioId
              AND a.reporte.creador.id <> :usuarioId
              AND a.reporte.oculto = false
            ORDER BY a.createdAt DESC, a.id DESC
            """)
    List<Reporte> reportesAdheridosPor(@Param("usuarioId") Long usuarioId);
}
