package pe.edu.upc.viasegura.reportes.infra;

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
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Sirve las fotos de evidencia de los reportes (US-05) como recursos
 * publicos en {@code /media/fotos/reportes/**}, <b>solo si el reporte y su
 * foto son visibles</b> (NC-11a).
 *
 * <p><b>Por que un resource handler y no un {@code @RestController}:</b> una
 * foto de reporte visible es un archivo sin ninguna regla de autorizacion por
 * usuario — es publica, igual que los reportes que ilustra (el mapa y la
 * busqueda de US-10/US-12 no exigen token y devuelven {@code fotoUrl}).
 * Spring resuelve aqui, sin codigo propio, el content-type,
 * {@code Last-Modified} y los GET condicionales, las peticiones de rango y el
 * rechazo de rutas con {@code ..} o codificaciones raras. Escribir un
 * controlador obligaria a reimplementar todo eso a mano, con mas superficie
 * de error y ningun beneficio.</p>
 *
 * <p><b>De donde sale la foto (DEP-12).</b> Un {@link ResourceResolver} propio
 * la pide a {@link FotoStorageService#cargarFotoReporte}, asi que el mismo
 * camino sirve con el disco local (desarrollo y tests) y con R2 (produccion):
 * la URL no cambia y el bucket sigue privado. Un nombre que no sea
 * {@code <uuid>.<ext>} se rechaza (404) antes de llamar al almacenamiento.</p>
 *
 * <p><b>Visibilidad (NC-11a, D-15, opcion A).</b> Antes de cargarla, el
 * resolver pregunta a {@link ReporteRepository#existeFotoVisible} si la foto
 * es de un reporte que no esta oculto y cuya foto tampoco lo esta. Si no, 404:
 * una foto oculta por el ADMIN, la de un reporte oculto y una foto que no es
 * de ningun reporte (huerfana) no se sirven, y en ese caso no se llega a R2.
 * Por eso esta clase vivia en {@code common/config} y ahora vive en
 * {@code reportes/infra}: servir la foto depende de una regla de
 * {@code reportes}, su visibilidad; guardarla y cargarla siguen en
 * {@code common} (D-11). No hace falta ningun puerto nuevo en
 * {@code common/port}, que es solo para E/S externa. Es atomico con la
 * transaccion que oculta, y restablecer es cambiar un booleano. Cuesta una
 * consulta indexada ({@code ix_reporte_foto_url}) por foto que llega al
 * origen, poco frente a la lectura de R2 que ya se hacia.</p>
 *
 * <p>Las fotos de <b>perfil</b> son el caso opuesto y por eso NO se sirven
 * aqui: requieren comprobar que quien pide el archivo es su dueno, y eso es
 * autorizacion por instancia, no por patron de ruta. Van por
 * {@code PerfilFotoController}. El ADMIN ve una foto oculta por
 * {@code GET /api/admin/moderacion/reportes/{id}/foto}.</p>
 */
@Configuration
public class FotosDeReporteWebConfig implements WebMvcConfigurer {

    /**
     * Los nombres de archivo son UUID: el contenido de una URL nunca cambia.
     * {@code immutable} evita que el navegador revalide al recargar.
     *
     * <p>NC-11a: {@code s-maxage=3600} para las caches compartidas (el borde de
     * Cloudflare). Ocultar una foto no la borra del borde: con esto deja de
     * servirse alli en una hora como maximo; para un caso urgente, la purga
     * manual de la URL (runbook). El navegador conserva sus 30 dias: lo que ya
     * descargo no se puede retirar.</p>
     */
    static final CacheControl CACHE_FOTOS = CacheControl.maxAge(Duration.ofDays(30))
            .cachePublic().immutable().sMaxAge(Duration.ofHours(1));

    private final String urlFotosReportes;
    private final FotoStorageService fotoStorageService;
    private final ReporteRepository reporteRepository;

    public FotosDeReporteWebConfig(
            @Value("${app.storage.fotos-url:/media/fotos}") String fotosUrl,
            FotoStorageService fotoStorageService,
            ReporteRepository reporteRepository) {
        String base = fotosUrl.endsWith("/") ? fotosUrl.substring(0, fotosUrl.length() - 1) : fotosUrl;
        this.urlFotosReportes = base + "/reportes/";
        this.fotoStorageService = fotoStorageService;
        this.reporteRepository = reporteRepository;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Sin addResourceLocations: el unico origen es el puerto. Sin la cache
        // de recursos de Spring: la del navegador (30 dias) basta, no se
        // retienen fotos en el heap, y una foto recien oculta no queda
        // guardada en el servidor.
        registry.addResourceHandler(urlFotosReportes + "**")
                .setCacheControl(CACHE_FOTOS)
                .resourceChain(false)
                .addResolver(new FotoDeReporteResolver(urlFotosReportes, fotoStorageService, reporteRepository));
    }

    /**
     * Resuelve {@code <uuid>.<ext>} contra el almacenamiento de fotos si es de
     * un reporte visible con la foto visible; lo demas, 404. La URL que se
     * busca en la base es la misma que guardo el almacenamiento
     * ({@code <fotos-url>/reportes/<uuid>.<ext>}).
     */
    private record FotoDeReporteResolver(String urlFotosReportes, FotoStorageService fotos,
                                         ReporteRepository reportes) implements ResourceResolver {

        @Override
        public Resource resolveResource(HttpServletRequest request, String requestPath,
                                        List<? extends Resource> locations, ResourceResolverChain chain) {
            if (!FotoStorageService.esNombreDeArchivoValido(requestPath)
                    || !reportes.existeFotoVisible(urlFotosReportes + requestPath)) {
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
