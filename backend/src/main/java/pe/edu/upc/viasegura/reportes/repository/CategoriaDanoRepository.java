package pe.edu.upc.viasegura.reportes.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;

/** Acceso a datos de {@link CategoriaDano} (patron Repository). */
public interface CategoriaDanoRepository extends JpaRepository<CategoriaDano, Long> {

    /** US-29: evita duplicados de nombre dentro del mismo distrito. */
    boolean existsByNombreIgnoreCaseAndDistritoId(String nombre, Long distritoId);

    /**
     * Categorias estandar (globales) activas.
     *
     * <p>Deliberadamente una query derivada y no un JPQL con
     * {@code (:distritoId IS NULL OR ...)}: ese patron ya rompio dos veces
     * en este proyecto (US-12/US-10 y US-28) porque Postgres no resuelve el
     * tipo de un parametro que solo aparece en un {@code IS NULL} aislado.
     * Combinar dos consultas derivadas en el servicio evita el problema de
     * raiz en vez de parchearlo con CAST.</p>
     */
    List<CategoriaDano> findByActivoTrueAndEsEstandarTrueOrderByNombreAsc();

    /** Categorias personalizadas activas de un distrito concreto (US-29). */
    List<CategoriaDano> findByActivoTrueAndDistritoIdOrderByNombreAsc(Long distritoId);
}
