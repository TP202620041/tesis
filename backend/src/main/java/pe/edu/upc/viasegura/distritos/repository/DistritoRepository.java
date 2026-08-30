package pe.edu.upc.viasegura.distritos.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pe.edu.upc.viasegura.distritos.domain.Distrito;

/** Acceso a datos de {@link Distrito}, incluida la consulta espacial. */
public interface DistritoRepository extends JpaRepository<Distrito, Long> {

    Optional<Distrito> findByNombre(String nombre);

    /** Catalogo alfabetico para selectores y filtros del frontend. */
    List<Distrito> findAllByOrderByNombreAsc();

    /**
     * Distrito cuyo poligono de limites contiene el punto (lon, lat).
     * Base de la asignacion automatica por coordenadas (US-05).
     *
     * <p>{@code ST_Covers} sobre {@code geography} usa el indice GiST
     * {@code ix_distrito_limites_gist} e incluye puntos sobre el borde.</p>
     */
    @Query(value = """
            SELECT * FROM distrito d
            WHERE ST_Covers(d.limites, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)
            LIMIT 1
            """, nativeQuery = true)
    Optional<Distrito> findDistritoQueContiene(@Param("lon") double lon, @Param("lat") double lat);
}
