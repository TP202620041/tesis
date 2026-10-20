package pe.edu.upc.viasegura.reportes.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.RangoFechas;
import pe.edu.upc.viasegura.reportes.dto.CeldaDensidadResponse;
import pe.edu.upc.viasegura.reportes.dto.DensidadReportesResponse;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Densidad de reportes para el mapa de calor (US-11).
 *
 * <p><b>Mismos filtros y misma visibilidad que la busqueda publica</b>
 * (US-10/US-12, {@link ReporteRepository#buscar}): distrito, categoria,
 * estado y rango de fechas opcionales; sin {@code estado}, todo salvo
 * {@code CANCELADO}. La capa de calor se dibuja sobre el mismo mapa y con
 * los mismos filtros que los marcadores, asi que no puede contar otra cosa.</p>
 *
 * <p><b>Por que se incluyen RECHAZADO y RESUELTO por defecto (SEC-01).</b>
 * Si el mapa de calor por defecto mostrara solo los reportes activos, una
 * municipalidad podria "enfriar" su distrito rechazando reportes: un actor
 * cambiaria la metrica publica que lo expone. Lo que la municipalidad hace
 * con un reporte no lo saca del mapa; quien quiera ver solo lo pendiente
 * filtra por {@code estado}. La unica salida es {@code CANCELADO}, que solo
 * puede hacer el ciudadano creador desde {@code PENDIENTE} (US-08).</p>
 *
 * <p><b>Cada reporte pesa 1</b>, no {@code totalAdhesiones}: las adhesiones
 * (US-09) las suma cualquier ciudadano con un clic, y ponderar por ellas
 * dejaria inflar la densidad de una zona sin reportar nada nuevo. Contar
 * reportes es robusto a los duplicados porque US-09 ya convierte en adhesion
 * un reporte de la misma categoria a menos de 20 m de otro activo.</p>
 */
@Service
@RequiredArgsConstructor
public class DensidadReportesService {

    /**
     * Lado de la celda en grados: unos 111 m de latitud y 109 m de longitud
     * en Lima (12 grados S). Fijo en el servidor, y no un parametro, para que
     * el cliente no pueda pedir una grilla tan fina que equivalga a la lista
     * de puntos, y para que la respuesta se pueda cachear por URL.
     */
    public static final double CELDA_GRADOS = 0.001;

    private final ReporteRepository reporteRepository;

    @Transactional(readOnly = true)
    public DensidadReportesResponse densidad(Long distritoId, Long categoriaId, EstadoReporte estado,
                                             Instant fechaDesde, Instant fechaHasta) {
        RangoFechas.validar(fechaDesde, fechaHasta);
        String estadoNombre = estado != null ? estado.name() : null;

        List<CeldaDensidadResponse> celdas = reporteRepository
                .densidadEnGrilla(CELDA_GRADOS, distritoId, categoriaId, estadoNombre, fechaDesde, fechaHasta)
                .stream()
                .map(c -> new CeldaDensidadResponse(
                        alaGrilla(c.getLatitud()), alaGrilla(c.getLongitud()), c.getCantidad()))
                .toList();
        long total = celdas.stream().mapToLong(CeldaDensidadResponse::cantidad).sum();
        return new DensidadReportesResponse(CELDA_GRADOS, total, celdas);
    }

    /**
     * {@code ST_SnapToGrid} devuelve multiplos de la celda con ruido de coma
     * flotante (-12.121000000000001); se redondea al decimal de la celda para
     * que el JSON sea estable (y con el, el ETag).
     */
    private static double alaGrilla(double valor) {
        return BigDecimal.valueOf(Math.round(valor / CELDA_GRADOS))
                .multiply(BigDecimal.valueOf(CELDA_GRADOS))
                .doubleValue();
    }
}
