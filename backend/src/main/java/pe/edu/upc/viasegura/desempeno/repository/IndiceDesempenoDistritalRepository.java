package pe.edu.upc.viasegura.desempeno.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.desempeno.domain.IndiceDesempenoDistrital;

/** Lectura del indice de desempeno distrital (US-18, US-20). */
public interface IndiceDesempenoDistritalRepository
        extends JpaRepository<IndiceDesempenoDistrital, String> {

    /**
     * Ranking general por distrito (fila agregada de todas las categorias,
     * {@code categoria_id IS NULL}). NULLS LAST deja al final a los distritos
     * sin reportes (tasa null), no arriba del ranking.
     */
    @Query("""
            SELECT i FROM IndiceDesempenoDistrital i
            WHERE i.categoriaId IS NULL
            ORDER BY i.tasaResolucion DESC NULLS LAST, i.distritoNombre ASC
            """)
    List<IndiceDesempenoDistrital> rankingGeneral();

    /** Ranking por distrito para una categoria concreta (desglose US-20). */
    @Query("""
            SELECT i FROM IndiceDesempenoDistrital i
            WHERE i.categoriaId = :categoriaId
            ORDER BY i.tasaResolucion DESC NULLS LAST, i.distritoNombre ASC
            """)
    List<IndiceDesempenoDistrital> rankingPorCategoria(@Param("categoriaId") Long categoriaId);

    /** US-17: fila agregada (todas las categorias) de UN distrito concreto. */
    Optional<IndiceDesempenoDistrital> findByDistritoIdAndCategoriaIdIsNull(Long distritoId);
}
