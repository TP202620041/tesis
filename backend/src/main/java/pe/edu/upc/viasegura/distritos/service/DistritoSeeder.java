package pe.edu.upc.viasegura.distritos.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.MultiPolygon;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.common.geo.GeoJsonMultiPolygonReader;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;

/**
 * Carga los limites de los 43 distritos de Lima Metropolitana (FASE 4).
 *
 * <p>Lee {@code data/distritos_lima.geojson} (derivado de la cartografia
 * distrital IGN/INEI publicada por joseluisq/peru-geojson-datasets) y
 * puebla la tabla {@code distrito} con sus poligonos MultiPolygon.</p>
 *
 * <p>Idempotente: si ya hay distritos cargados, no hace nada. Es
 * reference data, por eso se carga con un seeder de aplicacion y no con
 * una migracion Flyway de datos.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DistritoSeeder implements ApplicationRunner {

    private static final String RECURSO = "data/distritos_lima.geojson";

    private final DistritoRepository distritoRepository;
    private final GeoJsonMultiPolygonReader geoJsonReader;
    private final ObjectMapper objectMapper;

    @Override
    public void run(ApplicationArguments args) throws Exception {
        long existentes = distritoRepository.count();
        if (existentes > 0) {
            log.info("Seeder de distritos omitido: ya existen {} distritos.", existentes);
            return;
        }

        JsonNode root;
        try (InputStream in = new ClassPathResource(RECURSO).getInputStream()) {
            root = objectMapper.readTree(in);
        }

        List<Distrito> distritos = new ArrayList<>();
        for (JsonNode feature : root.get("features")) {
            String nombre = feature.get("properties").get("nombre").asText();
            MultiPolygon limites = geoJsonReader.toMultiPolygon(feature.get("geometry"));
            distritos.add(Distrito.builder().nombre(nombre).limites(limites).build());
        }

        distritoRepository.saveAll(distritos);
        log.info("Seeder de distritos: {} distritos de Lima Metropolitana cargados.", distritos.size());
    }
}
