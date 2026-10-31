package pe.edu.upc.viasegura.auth.infra;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import pe.edu.upc.viasegura.auth.domain.DominiosDesechables;

/**
 * Lee al arrancar la lista versionada de dominios desechables (NC-09):
 * {@code resources/data/dominios-desechables.txt}, una instantanea de la
 * lista CC0 {@code disposable-email-domains} (fuente, commit, fecha y
 * licencia en su cabecera y en el README).
 *
 * <p>Va en {@code infra} porque lee un archivo, como {@code DistritoSeeder}
 * con el GeoJSON; la regla (subdominios incluidos) es pura y vive en
 * {@link DominiosDesechables}, que es lo que recibe el servicio. Si el
 * archivo falta o queda vacio, la aplicacion no arranca: es parte del
 * codigo, y sin el el registro aceptaria correos desechables sin avisar.</p>
 */
@Slf4j
@Configuration
public class ArchivoDominiosDesechables {

    static final String RUTA = "data/dominios-desechables.txt";

    @Bean
    public DominiosDesechables dominiosDesechables() {
        DominiosDesechables lista = DominiosDesechables.desdeLineas(leer(RUTA));
        if (lista.tamano() == 0) {
            throw new IllegalStateException("La lista de dominios desechables (" + RUTA + ") esta vacia");
        }
        log.info("Lista de dominios desechables cargada: {} dominios", lista.tamano());
        return lista;
    }

    static List<String> leer(String ruta) {
        try (InputStream entrada = new ClassPathResource(ruta).getInputStream();
             BufferedReader lector = new BufferedReader(new InputStreamReader(entrada, StandardCharsets.UTF_8))) {
            return lector.lines().toList();
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo leer la lista de dominios desechables (" + ruta + ")", e);
        }
    }
}
