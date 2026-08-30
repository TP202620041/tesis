package pe.edu.upc.viasegura.reportes.geo;

import java.util.Optional;
import org.locationtech.jts.geom.Point;
import pe.edu.upc.viasegura.distritos.domain.Distrito;

/**
 * Estrategia de asignacion automatica de distrito a partir de una
 * ubicacion geografica (US-05, restriccion clave del negocio).
 *
 * <p>Patron Strategy: aisla el criterio de asignacion (hoy point-in-polygon
 * con PostGIS) para poder sustituirlo o combinarlo despues (p.ej. fallback
 * por distrito mas cercano) sin tocar la logica del reporte.</p>
 */
public interface GeoAssignmentStrategy {

    /** Determina el distrito que corresponde a la ubicacion, si alguno la contiene. */
    Optional<Distrito> asignarDistrito(Point ubicacion);
}
