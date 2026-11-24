package pe.edu.upc.viasegura.municipalidades.service;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.municipalidades.domain.Municipalidad;
import pe.edu.upc.viasegura.municipalidades.domain.PeriodoGestion;
import pe.edu.upc.viasegura.municipalidades.repository.MunicipalidadRepository;
import pe.edu.upc.viasegura.municipalidades.repository.PeriodoGestionRepository;

/**
 * API publica del modulo {@code municipalidades} para otros modulos (NC-01).
 *
 * <p>Las municipalidades las siembra {@code infra.MunicipalidadSeeder} y el
 * periodo 2023-2026 la migracion V15 (y 2027-2030 la V25, NC-06); aqui solo
 * se leen.</p>
 */
@Service
@RequiredArgsConstructor
public class MunicipalidadService {

    private final MunicipalidadRepository municipalidadRepository;
    private final PeriodoGestionRepository periodoGestionRepository;

    /**
     * Municipalidad que gestiona el distrito (D-09: exactamente una por
     * distrito). Distrito sin municipalidad o inexistente: 404.
     */
    @Transactional(readOnly = true)
    public Municipalidad deDistrito(Long distritoId) {
        return municipalidadRepository.findByDistritoId(distritoId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Municipalidad no encontrada para el distrito: " + distritoId));
    }

    /**
     * Periodo de gestion que contiene la fecha, o vacio si cae fuera de todo
     * periodo registrado. Un reporte cuenta en el periodo de su fecha de
     * creacion (ARCHITECTURE.md §4.3, paso 6).
     */
    @Transactional(readOnly = true)
    public Optional<PeriodoGestion> periodoVigente(LocalDate fecha) {
        return periodoGestionRepository
                .findFirstByFechaInicioLessThanEqualAndFechaFinGreaterThanEqualOrderByFechaInicioDesc(fecha, fecha);
    }

    /** Todos los periodos de gestion, el mas reciente primero (NC-06). */
    @Transactional(readOnly = true)
    public List<PeriodoGestion> periodos() {
        return periodoGestionRepository.findAllByOrderByFechaInicioDesc();
    }

    /** Periodo por id; inexistente: 404. */
    @Transactional(readOnly = true)
    public PeriodoGestion periodo(Long periodoId) {
        return periodoGestionRepository.findById(periodoId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Periodo de gestión no encontrado: " + periodoId));
    }
}
