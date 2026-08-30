package pe.edu.upc.viasegura.common.config;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Sirve las fotos de evidencia de los reportes (US-05) como recursos
 * estaticos publicos.
 *
 * <p><b>Por que un resource handler y no un {@code @RestController}:</b> una
 * foto de reporte es un archivo estatico sin ninguna regla de autorizacion
 * — es publica, igual que los reportes que ilustra (el mapa y la busqueda de
 * US-10/US-12 no exigen token y devuelven {@code fotoUrl}). Spring resuelve
 * aqui, sin codigo propio, el content-type, {@code ETag}, {@code
 * Last-Modified}, las peticiones de rango y la proteccion contra path
 * traversal. Escribir un controlador obligaria a reimplementar todo eso a
 * mano, con mas superficie de error y ningun beneficio.</p>
 *
 * <p>Las fotos de <b>perfil</b> son el caso opuesto y por eso NO se sirven
 * aqui: requieren comprobar que quien pide el archivo es su dueno, y eso es
 * autorizacion por instancia, no por patron de ruta. Un resource handler no
 * puede expresarlo. Van por {@code PerfilFotoController}.</p>
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    /** Los nombres de archivo son UUID: el contenido de una URL nunca cambia. */
    private static final Duration CACHE_FOTOS = Duration.ofDays(30);

    private final String urlFotosReportes;
    private final Path directorioFotosReportes;

    public WebMvcConfig(
            @Value("${app.storage.fotos-dir:./uploads/fotos}") String fotosDir,
            @Value("${app.storage.fotos-url:/media/fotos}") String fotosUrl) {
        String base = fotosUrl.endsWith("/") ? fotosUrl.substring(0, fotosUrl.length() - 1) : fotosUrl;
        this.urlFotosReportes = base + "/reportes/";
        this.directorioFotosReportes =
                Paths.get(fotosDir).toAbsolutePath().normalize().resolve("reportes");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // addResourceLocations necesita una URI de directorio terminada en "/".
        registry.addResourceHandler(urlFotosReportes + "**")
                .addResourceLocations(directorioFotosReportes.toUri().toString())
                .setCacheControl(CacheControl.maxAge(CACHE_FOTOS).cachePublic());
    }
}
