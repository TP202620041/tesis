package pe.edu.upc.viasegura.common.config;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.ResourceResolver;
import org.springframework.web.servlet.resource.ResourceResolverChain;
import pe.edu.upc.viasegura.common.port.FotoStorageService;

/**
 * Sirve las fotos de evidencia de los reportes (US-05) como recursos
 * publicos en {@code /media/fotos/reportes/**}.
 *
 * <p><b>Por que un resource handler y no un {@code @RestController}:</b> una
 * foto de reporte es un archivo sin ninguna regla de autorizacion — es
 * publica, igual que los reportes que ilustra (el mapa y la busqueda de
 * US-10/US-12 no exigen token y devuelven {@code fotoUrl}). Spring resuelve
 * aqui, sin codigo propio, el content-type, {@code Last-Modified} y los GET
 * condicionales, las peticiones de rango y el rechazo de rutas con
 * {@code ..} o codificaciones raras. Escribir un controlador obligaria a
 * reimplementar todo eso a mano, con mas superficie de error y ningun
 * beneficio.</p>
 *
 * <p><b>De donde sale la foto (DEP-12).</b> Antes el handler apuntaba al
 * directorio local. Ahora un {@link ResourceResolver} propio la pide a
 * {@link FotoStorageService#cargarFotoReporte}, asi que el mismo camino sirve
 * con el disco local (desarrollo y tests) y con R2 (produccion): la URL no
 * cambia y el bucket sigue privado. Un nombre que no sea
 * {@code <uuid>.<ext>} se rechaza (404) antes de llamar al almacenamiento.</p>
 *
 * <p>Las fotos de <b>perfil</b> son el caso opuesto y por eso NO se sirven
 * aqui: requieren comprobar que quien pide el archivo es su dueno, y eso es
 * autorizacion por instancia, no por patron de ruta. Un resource handler no
 * puede expresarlo. Van por {@code PerfilFotoController}.</p>
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    /**
     * Los nombres de archivo son UUID: el contenido de una URL nunca cambia.
     * {@code immutable} evita que el navegador revalide al recargar.
     */
    private static final CacheControl CACHE_FOTOS =
            CacheControl.maxAge(Duration.ofDays(30)).cachePublic().immutable();

    private final String urlFotosReportes;
    private final FotoStorageService fotoStorageService;

    public WebMvcConfig(
            @Value("${app.storage.fotos-url:/media/fotos}") String fotosUrl,
            FotoStorageService fotoStorageService) {
        String base = fotosUrl.endsWith("/") ? fotosUrl.substring(0, fotosUrl.length() - 1) : fotosUrl;
        this.urlFotosReportes = base + "/reportes/";
        this.fotoStorageService = fotoStorageService;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Sin addResourceLocations: el unico origen es el puerto. Sin la cache
        // de recursos de Spring: la del navegador (30 dias) basta y no se
        // retienen fotos en el heap.
        registry.addResourceHandler(urlFotosReportes + "**")
                .setCacheControl(CACHE_FOTOS)
                .resourceChain(false)
                .addResolver(new FotoDeReporteResolver(fotoStorageService));
    }

    /** Resuelve {@code <uuid>.<ext>} contra el almacenamiento de fotos; lo demas, 404. */
    private record FotoDeReporteResolver(FotoStorageService fotos) implements ResourceResolver {

        @Override
        public Resource resolveResource(HttpServletRequest request, String requestPath,
                                        List<? extends Resource> locations, ResourceResolverChain chain) {
            if (!FotoStorageService.esNombreDeArchivoValido(requestPath)) {
                return null;
            }
            return fotos.cargarFotoReporte(requestPath);
        }

        @Override
        public String resolveUrlPath(String resourcePath, List<? extends Resource> locations,
                                     ResourceResolverChain chain) {
            return FotoStorageService.esNombreDeArchivoValido(resourcePath) ? resourcePath : null;
        }
    }
}
