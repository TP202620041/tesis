package pe.edu.upc.viasegura.desempeno.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.desempeno.domain.IndiceDesempenoDistrital;
import pe.edu.upc.viasegura.desempeno.domain.KpiGestionDistrital;
import pe.edu.upc.viasegura.desempeno.dto.DashboardDistritoResponse;
import pe.edu.upc.viasegura.desempeno.dto.DashboardGestionResponse;
import pe.edu.upc.viasegura.desempeno.dto.DesempenoDistritalResponse;
import pe.edu.upc.viasegura.desempeno.dto.KpiGestionDistritalResponse;
import pe.edu.upc.viasegura.desempeno.dto.PeriodoGestionResponse;
import pe.edu.upc.viasegura.desempeno.repository.IndiceDesempenoDistritalRepository;
import pe.edu.upc.viasegura.desempeno.repository.KpiGestionDistritalRepository;
import pe.edu.upc.viasegura.municipalidades.domain.PeriodoGestion;
import pe.edu.upc.viasegura.municipalidades.service.MunicipalidadService;
import pe.edu.upc.viasegura.reportes.service.ReporteConsultaService;

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

    /** NC-06: el periodo vigente se decide con la fecha de hoy en Lima. */
    private static final ZoneId ZONA_LIMA = ZoneId.of("America/Lima");

    private final IndiceDesempenoDistritalRepository indiceRepository;
    private final KpiGestionDistritalRepository kpiGestionRepository;
    private final MunicipalidadService municipalidadService;
    private final ReporteConsultaService reporteConsultaService;
    private final UsuarioConsultaService usuarioConsultaService;

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
        Usuario funcionario = usuarioConsultaService.usuarioPorEmail(emailFuncionario);
        if (funcionario.getDistrito() == null) {
            throw new AccessDeniedException("El funcionario no tiene un distrito de gestión asignado");
        }
        Long distritoId = funcionario.getDistrito().getId();

        IndiceDesempenoDistrital fila = indiceRepository.findByDistritoIdAndCategoriaIdIsNull(distritoId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Sin datos de desempeño para el distrito " + distritoId));

        long sinResponsable = reporteConsultaService.contarSinResponsable(distritoId);
        Instant limite = Instant.now().minus(DIAS_ESTANCAMIENTO, ChronoUnit.DAYS);
        long estancados = reporteConsultaService.contarEstancados(distritoId, limite);

        return new DashboardDistritoResponse(
                DesempenoDistritalResponse.from(fila), sinResponsable, estancados);
    }

    /**
     * NC-06: periodos de gestion para el filtro del dashboard publico, el mas
     * reciente primero, marcando el vigente hoy.
     */
    @Transactional(readOnly = true)
    public List<PeriodoGestionResponse> periodos() {
        LocalDate hoy = LocalDate.now(ZONA_LIMA);
        return municipalidadService.periodos().stream()
                .map(p -> aRespuesta(p, hoy))
                .toList();
    }

    /**
     * NC-06 (OE3-I5): KPIs de cada municipalidad en un periodo de gestion.
     * Sin {@code periodoId}, el vigente hoy; si hoy no cae en ningun periodo,
     * 404 (la PWA pide la lista y elige uno). {@code categoriaId} opcional,
     * como en el indice de US-20: con el, solo los distritos con reportes de
     * esa categoria en el periodo.
     */
    @Transactional(readOnly = true)
    public DashboardGestionResponse dashboardGestion(Long periodoId, Long categoriaId) {
        LocalDate hoy = LocalDate.now(ZONA_LIMA);
        PeriodoGestion periodo = (periodoId != null)
                ? municipalidadService.periodo(periodoId)
                : municipalidadService.periodoVigente(hoy).orElseThrow(() -> new ResourceNotFoundException(
                        "No hay un periodo de gestión vigente; indique periodoId"));

        List<KpiGestionDistrital> filas = (categoriaId == null)
                ? kpiGestionRepository.generalDelPeriodo(periodo.getId())
                : kpiGestionRepository.categoriaDelPeriodo(periodo.getId(), categoriaId);
        Instant calculadoEn = filas.stream()
                .map(KpiGestionDistrital::getCalculatedAt)
                .findFirst().orElse(null);

        return new DashboardGestionResponse(
                aRespuesta(periodo, hoy),
                categoriaId,
                calculadoEn,
                filas.stream().map(KpiGestionDistritalResponse::from).toList());
    }

    private static PeriodoGestionResponse aRespuesta(PeriodoGestion p, LocalDate hoy) {
        return new PeriodoGestionResponse(p.getId(), p.getFechaInicio(), p.getFechaFin(), p.incluye(hoy));
    }

    /**
     * Recalcula las vistas materializadas: el indice de US-18/US-20 y, desde
     * NC-06, los KPIs por periodo, que dependen de los mismos eventos. Van en
     * la misma transaccion para que el dashboard por periodo y el indice
     * nunca se contradigan entre si. Desde BE-12 la invoca el listener en
     * el executor del indice, despues del commit y fuera del hilo de la
     * peticion, coalesciendo los eventos. {@code REQUIRES_NEW}: transaccion
     * propia aunque alguien la llame con una abierta, y un fallo nunca
     * revierte un cambio de negocio. {@code CONCURRENTLY} evita bloquear las
     * lecturas durante el recalculo.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void refrescarIndice() {
        entityManager.createNativeQuery(
                "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_indice_desempeno_distrital")
                .executeUpdate();
        entityManager.createNativeQuery(
                "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_kpi_gestion_distrital")
                .executeUpdate();
    }
}
