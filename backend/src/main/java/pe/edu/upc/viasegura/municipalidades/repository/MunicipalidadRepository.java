package pe.edu.upc.viasegura.municipalidades.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import pe.edu.upc.viasegura.municipalidades.domain.Municipalidad;

public interface MunicipalidadRepository extends JpaRepository<Municipalidad, Long> {

    /** Con el distrito cargado, para que otros modulos lo lean fuera de la transaccion. */
    @EntityGraph(attributePaths = "distrito")
    Optional<Municipalidad> findByDistritoId(Long distritoId);

    /**
     * Distritos que todavia no tienen municipalidad, para el seeder. Nativa a
     * proposito: el seeder es {@code infra} y no puede usar ni el repositorio
     * de {@code distritos} (§4.3) ni su {@code service} (regla {@code capas}),
     * asi que lee la tabla {@code distrito}, que ya es parte del contrato de
     * esta tabla por su FK.
     */
    @Query(value = """
            SELECT d.id AS id, d.nombre AS nombre
              FROM distrito d
             WHERE NOT EXISTS (SELECT 1 FROM municipalidad m WHERE m.distrito_id = d.id)
             ORDER BY d.nombre
            """, nativeQuery = true)
    List<DistritoSinMunicipalidad> distritosSinMunicipalidad();

    /** Proyeccion de {@link #distritosSinMunicipalidad()}. */
    interface DistritoSinMunicipalidad {
        Long getId();

        String getNombre();
    }
}
