package pe.edu.upc.viasegura.desempeno.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.desempeno.domain.IndiceDesempenoDistrital;
import pe.edu.upc.viasegura.desempeno.dto.DashboardDistritoResponse;
import pe.edu.upc.viasegura.desempeno.dto.DesempenoDistritalResponse;
import pe.edu.upc.viasegura.desempeno.repository.IndiceDesempenoDistritalRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Lectura y refresco del indice de desempeno distrital (US-18, US-20).
 *
 * <p>El indice vive en una vista materializada
 * ({@code mv_indice_desempeno_distrital}) precomputada para que la lectura
 * publica sea barata. Se refresca de forma dirigida por evento (al resolver
 * un reporte o al registrar una calificacion) para cumplir el requisito de
 * "tiempo real" del backlog, via {@code REFRESH ... CONCURRENTLY} (no bloquea
 * lecturas; requiere el indice unico ya existente).</p>
 */
@Service
@RequiredArgsConstructor
public class DesempenoService {

    /** US-17: dias sin cambio de estado para considerar un reporte estancado. */
    private static final int DIAS_ESTANCAMIENTO = 7;

    private final IndiceDesempenoDistritalRepository indiceRepository;
    private final ReporteRepository reporteRepository;
    private final UsuarioRepository usuarioRepository;

    @PersistenceContext
    private EntityManager entityManager;

    /** Ranking de distritos; {@code categoriaId} null = agregado general. */
    @Transactional(readOnly = true)
    public List<DesempenoDistritalResponse> ranking(Long categoriaId) {
        var filas = (categoriaId == null)
                ? indiceRepository.rankingGeneral()
                : indiceRepository.rankingPorCategoria(categoriaId);
        return filas.stream().map(DesempenoDistritalResponse::from).toList();
    }

    /**
     * US-17: dashboard del funcionario para su propio distrito. El
     * {@code resumen} es la MISMA fila general del indice publico (US-18)
     * filtrada a su distrito -- no se recalcula ni duplica. Se agregan 2
     * metricas operativas que no tiene sentido publicar (gestion interna,
     * no transparencia ciudadana): reportes sin responsable asignado y
     * reportes estancados (sin cambio de estado hace mas de
     * {@value #DIAS_ESTANCAMIENTO} dias).
     */
    @Transactional(readOnly = true)
    public DashboardDistritoResponse dashboardDistrito(String emailFuncionario) {
        Usuario funcionario = usuarioRepository.findByEmail(emailFuncionario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        if (funcionario.getDistrito() == null) {
            throw new AccessDeniedException("El funcionario no tiene un distrito de gestion asignado");
        }
        Long distritoId = funcionario.getDistrito().getId();

        IndiceDesempenoDistrital fila = indiceRepository.findByDistritoIdAndCategoriaIdIsNull(distritoId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Sin datos de desempeno para el distrito " + distritoId));

        long sinResponsable = reporteRepository.countSinResponsable(distritoId);
        Instant limite = Instant.now().minus(DIAS_ESTANCAMIENTO, ChronoUnit.DAYS);
        long estancados = reporteRepository.countEstancados(distritoId, limite);

        return new DashboardDistritoResponse(
                DesempenoDistritalResponse.from(fila), sinResponsable, estancados);
    }

    /**
     * Recalcula la vista materializada. Se invoca AFTER_COMMIT desde el
     * listener (por eso {@code REQUIRES_NEW}: transaccion propia, un fallo no
     * revierte el cambio de negocio ya confirmado). {@code CONCURRENTLY}
     * evita bloquear las lecturas durante el recalculo.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void refrescarIndice() {
        entityManager.createNativeQuery(
                "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_indice_desempeno_distrital")
                .executeUpdate();
    }
}
