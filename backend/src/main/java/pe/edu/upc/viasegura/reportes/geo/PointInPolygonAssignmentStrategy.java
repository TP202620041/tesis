package pe.edu.upc.viasegura.reportes.geo;

import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.locationtech.jts.geom.Point;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;

/**
 * Asignacion por contencion punto-en-poligono (point-in-polygon) resuelta
 * en PostGIS con {@code ST_Covers} sobre los limites distritales,
 * apoyada en el indice espacial GiST.
 */
@Component
@RequiredArgsConstructor
public class PointInPolygonAssignmentStrategy implements GeoAssignmentStrategy {

    private final DistritoRepository distritoRepository;

    @Override
    public Optional<Distrito> asignarDistrito(Point ubicacion) {
        return distritoRepository.findDistritoQueContiene(ubicacion.getX(), ubicacion.getY());
    }
}
