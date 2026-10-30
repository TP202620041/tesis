package pe.edu.upc.viasegura.moderacion.infra;

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
import pe.edu.upc.viasegura.moderacion.domain.FiltroDeGroserias;

/**
 * Lee al arrancar la lista versionada de groserias (NC-10b, D-15):
 * {@code resources/moderacion/groserias-es-pe.txt}, propia del proyecto (no
 * copia ninguna lista de terceros), con la version, la fecha y los criterios
 * en su cabecera.
 *
 * <p>Va en {@code infra} porque lee un archivo, como
 * {@code auth/infra/ArchivoDominiosDesechables}; la regla es pura y vive en
 * {@link FiltroDeGroserias}, que es lo que recibe el servicio. No hace falta
 * un puerto: no hay E/S externa en tiempo de ejecucion (D-04). <b>Si el
 * archivo falta, no tiene version, tiene una entrada invalida o queda vacio,
 * la aplicacion no arranca</b>: es parte del codigo, y sin el se publicarian
 * groserias sin avisar.</p>
 */
@Slf4j
@Configuration
public class ListaDeGroseriasConfig {

    static final String RUTA = "moderacion/groserias-es-pe.txt";

    @Bean
    public FiltroDeGroserias filtroDeGroserias() {
        FiltroDeGroserias filtro;
        try {
            filtro = FiltroDeGroserias.desdeLineas(leer(RUTA));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("La lista de groserias (" + RUTA + ") no es valida: " + e.getMessage(), e);
        }
        if (filtro.tamano() == 0) {
            throw new IllegalStateException("La lista de groserias (" + RUTA + ") esta vacia");
        }
        log.info("Lista de groserias cargada: version {}, {} entradas", filtro.version(), filtro.tamano());
        return filtro;
    }

    static List<String> leer(String ruta) {
        try (InputStream entrada = new ClassPathResource(ruta).getInputStream();
             BufferedReader lector = new BufferedReader(new InputStreamReader(entrada, StandardCharsets.UTF_8))) {
            return lector.lines().toList();
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo leer la lista de groserias (" + ruta + ")", e);
        }
    }
}
