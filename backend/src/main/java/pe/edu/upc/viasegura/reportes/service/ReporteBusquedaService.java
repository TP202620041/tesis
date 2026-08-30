package pe.edu.upc.viasegura.reportes.service;

import java.time.Instant;
import java.util.Objects;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.dto.ReporteResumenResponse;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Busqueda publica de reportes por distrito, categoria, estado y fechas
 * (US-12), reutilizada por el mapa interactivo (US-10) agregando un area
 * rectangular opcional (bounding box). Un solo endpoint para ambas
 * historias: el area es un filtro mas sobre la misma consulta, no un caso
 * de uso distinto -- ver {@link ReporteRepository#buscar}.
 *
 * <p>Publica sin autenticacion, igual que el indice de desempeno (US-18):
 * {@link ReporteResumenResponse} ya no expone identidad del creador (nace
 * de la bandeja municipal US-13), asi que reusarla aqui no filtra PII.</p>
 */
@Service
@RequiredArgsConstructor
public class ReporteBusquedaService {

    private final ReporteRepository reporteRepository;

    @Transactional(readOnly = true)
    public Page<ReporteResumenResponse> buscar(
            Long distritoId, Long categoriaId, EstadoReporte estado,
            Instant fechaDesde, Instant fechaHasta,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            Pageable pageable) {

        validarBbox(minLat, minLon, maxLat, maxLon);

        // La consulta es NATIVA con ORDER BY fijo (created_at DESC): un
        // Pageable con Sort haria que Spring Data intente anexar su propio
        // ORDER BY usando el nombre de propiedad Java tal cual (createdAt),
        // que no existe como columna (created_at) y rompe la consulta. Se
        // descarta cualquier Sort entrante y se conserva solo pagina/tamano.
        Pageable soloPaginacion = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        String estadoNombre = estado != null ? estado.name() : null;

        var pagina = (minLat != null)
                ? reporteRepository.buscarEnArea(distritoId, categoriaId, estadoNombre,
                        fechaDesde, fechaHasta, minLon, minLat, maxLon, maxLat, soloPaginacion)
                : reporteRepository.buscar(distritoId, categoriaId, estadoNombre,
                        fechaDesde, fechaHasta, soloPaginacion);

        return pagina.map(ReporteResumenResponse::from);
    }

    /**
     * US-10: el area del mapa es todo-o-nada -- un limite suelto no define
     * un rectangulo valido.
     */
    private void validarBbox(Double minLat, Double minLon, Double maxLat, Double maxLon) {
        long presentes = Stream.of(minLat, minLon, maxLat, maxLon).filter(Objects::nonNull).count();
        if (presentes != 0 && presentes != 4) {
            throw new IllegalArgumentException(
                    "El area del mapa requiere minLat, minLon, maxLat y maxLon juntos");
        }
    }
}
