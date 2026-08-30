package pe.edu.upc.viasegura.common.geo;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;

/** Utilidades para construir geometrias JTS en SRID 4326 (WGS84). */
public final class GeometryUtils {

    public static final int SRID_WGS84 = 4326;

    private static final GeometryFactory GEOMETRY_FACTORY =
            new GeometryFactory(new PrecisionModel(), SRID_WGS84);

    private GeometryUtils() {
    }

    /**
     * Crea un {@link Point} en SRID 4326.
     *
     * @param longitud coordenada X (este-oeste)
     * @param latitud  coordenada Y (norte-sur)
     */
    public static Point point(double longitud, double latitud) {
        Point punto = GEOMETRY_FACTORY.createPoint(new Coordinate(longitud, latitud));
        punto.setSRID(SRID_WGS84);
        return punto;
    }
}
