package pe.edu.upc.viasegura.clasificacion.infra;

import java.net.URI;
import java.net.URISyntaxException;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Valida {@code app.clasificacion.tipo} ({@code CLASIFICACION_TIPO}) al
 * arrancar (NC-04), igual que {@code ValidacionAlmacenDeFotos} con las fotos.
 *
 * <p>El adaptador de {@code ClasificadorDano} se elige con
 * {@code @ConditionalOnProperty}: {@code falso} ({@code FalsoClasificadorAdapter},
 * tambien sin la propiedad) o {@code http} ({@code InferenciaHttpAdapter},
 * NC-04b). Con un valor desconocido no se crea ninguno y el arranque fallaba
 * con un generico «No qualifying bean of type ClasificadorDano», que no dice
 * que variable revisar.</p>
 *
 * <p>Con {@code http} exige ademas la URL base del servicio
 * ({@code CLASIFICACION_URL}, {@code app.clasificacion.http.url}): sin ella
 * cada clasificacion fallaria en silencio («sin sugerencia» con un WARN) y
 * nada lo advertiria al desplegar. Con {@code falso} la URL no se mira.</p>
 *
 * <p>Es un {@link BeanFactoryPostProcessor} para que corra <b>antes</b> de
 * crear cualquier bean (y por lo tanto antes de tocar la base). Compara el
 * tipo como la condicion del adaptador: sin distinguir mayusculas y sin
 * recortar espacios.</p>
 */
@Component
public class ValidacionTipoClasificador implements BeanFactoryPostProcessor, EnvironmentAware {

    static final String PROPIEDAD = "app.clasificacion.tipo";
    static final String PROPIEDAD_URL = "app.clasificacion.http.url";

    private Environment entorno;

    @Override
    public void setEnvironment(Environment entorno) {
        this.entorno = entorno;
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
        validar(entorno);
    }

    /** Falla con un mensaje que nombra la variable y los valores admitidos. */
    static void validar(Environment entorno) {
        if (!entorno.containsProperty(PROPIEDAD)) {
            return; // sin la propiedad: falso (matchIfMissing)
        }
        String valor = entorno.getProperty(PROPIEDAD);
        if ("http".equalsIgnoreCase(valor)) {
            validarUrl(entorno.getProperty(PROPIEDAD_URL));
            return;
        }
        if (!"falso".equalsIgnoreCase(valor)) {
            throw new IllegalStateException(("CLASIFICACION_TIPO (" + PROPIEDAD + ") tiene un valor no admitido:"
                    + " '%s'. Use 'http' (servicio inferencia/, con CLASIFICACION_URL) o 'falso' (respuestas fijas"
                    + " por configuracion; en produccion, la clasificacion apagada).").formatted(valor));
        }
    }

    /** Una URL {@code http(s)://host[:puerto]}: la base del servicio, sin la ruta {@code /v1/...}. */
    private static void validarUrl(String url) {
        if (url == null || url.isBlank()) {
            throw new IllegalStateException("Con CLASIFICACION_TIPO=http falta CLASIFICACION_URL (" + PROPIEDAD_URL
                    + "): la URL base del servicio de inferencia, p. ej. http://inferencia.railway.internal:8000");
        }
        URI uri;
        try {
            uri = new URI(url.strip());
        } catch (URISyntaxException e) {
            throw urlInvalida(url);
        }
        boolean esquemaHttp = "http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme());
        if (!esquemaHttp || uri.getHost() == null) {
            throw urlInvalida(url);
        }
    }

    private static IllegalStateException urlInvalida(String url) {
        return new IllegalStateException(("CLASIFICACION_URL (" + PROPIEDAD_URL + ") no es una URL http(s) con"
                + " host: '%s'. Use la base del servicio de inferencia, p. ej."
                + " http://inferencia.railway.internal:8000").formatted(url));
    }
}
