package pe.edu.upc.viasegura.reportes.infra;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.reportes.port.GeoAssignmentStrategy;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Regresion automatizada de la asignacion automatica de distrito (US-05),
 * con las mismas coordenadas verificadas manualmente. Corre sobre PostGIS
 * real con los 43 distritos cargados por el DistritoSeeder.
 */
class PointInPolygonAssignmentStrategyIT extends AbstractPostgisIT {

    @Autowired
    GeoAssignmentStrategy geoAssignmentStrategy;

    @ParameterizedTest(name = "({0}, {1}) => {2}")
    @CsvSource({
            // lat, lon, distrito esperado
            "-12.1215, -77.0297, Miraflores",         // Parque Kennedy
            "-12.0855, -76.9756, Santiago de Surco",  // Jockey Plaza
            "-12.0464, -77.0300, Lima",               // Plaza Mayor de Lima
            "-12.0975, -77.0490, San Isidro"          // Ovalo Gutierrez (borde)
    })
    void asignarDistrito_puntoConocido_devuelveDistritoEsperado(double lat, double lon, String esperado) {
        Optional<Distrito> distrito = geoAssignmentStrategy.asignarDistrito(GeometryUtils.point(lon, lat));

        assertThat(distrito).isPresent();
        assertThat(distrito.get().getNombre()).isEqualTo(esperado);
    }

    @Test
    void asignarDistrito_puntoFueraDeLima_devuelveVacio() {
        // Arequipa: ninguna cobertura => base del rechazo "fuera de cobertura" (409).
        Optional<Distrito> distrito =
                geoAssignmentStrategy.asignarDistrito(GeometryUtils.point(-71.5375, -16.409));

        assertThat(distrito).isEmpty();
    }
}
