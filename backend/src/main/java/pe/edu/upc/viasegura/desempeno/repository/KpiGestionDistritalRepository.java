package pe.edu.upc.viasegura.desempeno.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.desempeno.domain.KpiGestionDistrital;

/** Lectura de los KPIs por periodo de gestion (NC-06). */
public interface KpiGestionDistritalRepository extends JpaRepository<KpiGestionDistrital, String> {

    /**
     * Fila agregada de cada distrito en el periodo. Mismo orden que el ranking
     * de US-18: tasa descendente, los que no tienen datos al final.
     */
    @Query("""
            SELECT k FROM KpiGestionDistrital k
            WHERE k.periodoGestionId = :periodoId AND k.categoriaId IS NULL
            ORDER BY k.tasaResolucion DESC NULLS LAST, k.distritoNombre ASC
            """)
    List<KpiGestionDistrital> generalDelPeriodo(@Param("periodoId") Long periodoId);

    /** Desglose de una categoria en el periodo (solo distritos con reportes de ella). */
    @Query("""
            SELECT k FROM KpiGestionDistrital k
            WHERE k.periodoGestionId = :periodoId AND k.categoriaId = :categoriaId
            ORDER BY k.tasaResolucion DESC NULLS LAST, k.distritoNombre ASC
            """)
    List<KpiGestionDistrital> categoriaDelPeriodo(@Param("periodoId") Long periodoId,
                                                  @Param("categoriaId") Long categoriaId);
}
