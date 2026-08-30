package pe.edu.upc.viasegura.common.geo;

import com.fasterxml.jackson.databind.JsonNode;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.stereotype.Component;

/**
 * Convierte una geometria GeoJSON de tipo {@code MultiPolygon} (nodo
 * Jackson) en una {@link MultiPolygon} JTS con SRID 4326, apta para
 * persistir en columnas {@code GEOGRAPHY(MultiPolygon,4326)} via Hibernate
 * Spatial.
 *
 * <p>GeoJSON usa el orden [longitud, latitud], que coincide con el orden
 * (X, Y) que espera PostGIS para geography 4326.</p>
 */
@Component
public class GeoJsonMultiPolygonReader {

    private static final int SRID_WGS84 = 4326;
    private final GeometryFactory geometryFactory =
            new GeometryFactory(new PrecisionModel(), SRID_WGS84);

    /** @param geometry nodo {@code geometry} de una Feature GeoJSON (MultiPolygon). */
    public MultiPolygon toMultiPolygon(JsonNode geometry) {
        String tipo = geometry.path("type").asText();
        if (!"MultiPolygon".equals(tipo)) {
            throw new IllegalArgumentException("Se esperaba MultiPolygon, se recibio: " + tipo);
        }
        JsonNode poligonos = geometry.get("coordinates");
        Polygon[] resultado = new Polygon[poligonos.size()];
        for (int i = 0; i < poligonos.size(); i++) {
            resultado[i] = toPolygon(poligonos.get(i));
        }
        MultiPolygon multiPolygon = geometryFactory.createMultiPolygon(resultado);
        multiPolygon.setSRID(SRID_WGS84);
        return multiPolygon;
    }

    private Polygon toPolygon(JsonNode anillos) {
        LinearRing shell = toLinearRing(anillos.get(0));
        LinearRing[] holes = new LinearRing[anillos.size() - 1];
        for (int i = 1; i < anillos.size(); i++) {
            holes[i - 1] = toLinearRing(anillos.get(i));
        }
        return geometryFactory.createPolygon(shell, holes);
    }

    private LinearRing toLinearRing(JsonNode anillo) {
        Coordinate[] coordenadas = new Coordinate[anillo.size()];
        for (int i = 0; i < anillo.size(); i++) {
            JsonNode punto = anillo.get(i);
            coordenadas[i] = new Coordinate(punto.get(0).asDouble(), punto.get(1).asDouble());
        }
        return geometryFactory.createLinearRing(coordenadas);
    }
}
