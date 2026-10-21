package pe.edu.upc.viasegura.municipalidades.repository;

import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.edu.upc.viasegura.municipalidades.domain.PeriodoGestion;

public interface PeriodoGestionRepository extends JpaRepository<PeriodoGestion, Long> {

    /** Periodo que contiene la fecha (extremos inclusivos). */
    Optional<PeriodoGestion> findFirstByFechaInicioLessThanEqualAndFechaFinGreaterThanEqualOrderByFechaInicioDesc(
            LocalDate desde, LocalDate hasta);
}
