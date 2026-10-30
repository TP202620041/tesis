package pe.edu.upc.viasegura.moderacion.infra;

import java.net.URI;
import java.net.URISyntaxException;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.moderacion.domain.PoliticaDeModeracion;

/**
 * Valida la configuracion de la moderacion al arrancar (NC-10b), con el mismo
 * criterio que {@code clasificacion/infra/ValidacionTipoClasificador} y
 * {@code auth/infra/ValidacionTipoCaptcha}.
 *
 * <ul>
 *   <li>{@code app.moderacion.tipo} ({@code MODERACION_TIPO}): {@code http}
 *       ({@code InferenciaModeracionHttpAdapter}) o {@code ninguna}
 *       ({@code SinModeracionAdapter}, tambien sin la propiedad). Con otro
 *       valor no se crea ningun adaptador y el arranque fallaria con un
 *       generico «required a bean of type ModeradorDeImagen» que no dice que
 *       variable revisar. En {@code prod} la variable no tiene valor por
 *       defecto: sin ella, el arranque falla al leerla aqui.</li>
 *   <li>Con {@code http}, {@code app.moderacion.http.url}
 *       ({@code MODERACION_URL}): <b>solo la base</b>,
 *       {@code http(s)://host[:puerto]}, sin ruta, query, fragmento ni
 *       usuario. El adaptador agrega {@code /v1/moderacion}; con una ruta de
 *       mas, cada creacion con foto recibiria un 503. Con usuario, el mensaje
 *       no repite la URL.</li>
 *   <li>{@code app.moderacion.umbral} ({@code MODERACION_UMBRAL}): entre
 *       {@value PoliticaDeModeracion#UMBRAL_MINIMO} y
 *       {@value PoliticaDeModeracion#UMBRAL_MAXIMO}, con cualquier tipo.</li>
 * </ul>
 *
 * <p>Es un {@link BeanFactoryPostProcessor} para que corra <b>antes</b> de
 * crear cualquier bean (y por lo tanto antes de tocar la base). Compara el
 * tipo como la condicion de los adaptadores: sin distinguir mayusculas y sin
 * recortar espacios.</p>
 */
@Component
public class ValidacionTipoModeracion implements BeanFactoryPostProcessor, EnvironmentAware {

    static final String PROPIEDAD = "app.moderacion.tipo";
    static final String PROPIEDAD_URL = "app.moderacion.http.url";
    static final String PROPIEDAD_UMBRAL = "app.moderacion.umbral";

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
        validarUmbral(entorno.getProperty(PROPIEDAD_UMBRAL));
        if (!entorno.containsProperty(PROPIEDAD)) {
            return; // sin la propiedad: ninguna (matchIfMissing)
        }
        String valor = entorno.getProperty(PROPIEDAD);
        if ("http".equalsIgnoreCase(valor)) {
            validarUrl(entorno.getProperty(PROPIEDAD_URL));
            return;
        }
        if (!"ninguna".equalsIgnoreCase(valor)) {
            throw new IllegalStateException(("MODERACION_TIPO (" + PROPIEDAD + ") tiene un valor no admitido: '%s'."
                    + " Use 'http' (servicio inferencia/, con MODERACION_URL) o 'ninguna' (sin revisar las fotos;"
                    + " en produccion, el interruptor de emergencia).").formatted(valor));
        }
    }

    /** Sin la propiedad, vale el 0,70 por defecto. */
    private static void validarUmbral(String valor) {
        if (valor == null) {
            return;
        }
        double umbral;
        try {
            umbral = Double.parseDouble(valor.strip());
        } catch (NumberFormatException e) {
            throw umbralInvalido("'" + valor + "' no es un numero (con punto decimal: 0.70)");
        }
        if (!PoliticaDeModeracion.umbralValido(umbral)) {
            throw umbralInvalido(valor.strip() + " esta fuera del rango");
        }
    }

    private static IllegalStateException umbralInvalido(String motivo) {
        return new IllegalStateException("MODERACION_UMBRAL (" + PROPIEDAD_UMBRAL + ") debe estar entre "
                + PoliticaDeModeracion.UMBRAL_MINIMO + " y " + PoliticaDeModeracion.UMBRAL_MAXIMO + ": " + motivo);
    }

    /** Una URL {@code http(s)://host[:puerto]}: la base del servicio, sin la ruta {@code /v1/...}. */
    private static void validarUrl(String url) {
        if (url == null || url.isBlank()) {
            throw new IllegalStateException("Con MODERACION_TIPO=http falta MODERACION_URL (" + PROPIEDAD_URL
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
        if (uri.getRawUserInfo() != null) {
            throw noEsSoloLaBase("tiene usuario o contrasena (no se repite aqui)");
        }
        String ruta = uri.getRawPath();
        if (ruta != null && !ruta.isEmpty() && !"/".equals(ruta)) {
            throw noEsSoloLaBase("tiene la ruta '" + ruta + "'");
        }
        if (uri.getRawQuery() != null) {
            throw noEsSoloLaBase("tiene query");
        }
        if (uri.getRawFragment() != null) {
            throw noEsSoloLaBase("tiene fragmento");
        }
    }

    private static IllegalStateException urlInvalida(String url) {
        String mostrada = url.contains("@") ? "(con usuario: no se repite aqui)" : "'" + url + "'";
        return new IllegalStateException(("MODERACION_URL (" + PROPIEDAD_URL + ") no es una URL http(s) con"
                + " host: %s. Use la base del servicio de inferencia, p. ej."
                + " http://inferencia.railway.internal:8000").formatted(mostrada));
    }

    private static IllegalStateException noEsSoloLaBase(String motivo) {
        return new IllegalStateException("MODERACION_URL (" + PROPIEDAD_URL + ") debe ser solo la base del"
                + " servicio, http(s)://host[:puerto], sin ruta, query, fragmento ni usuario (el adaptador agrega "
                + InferenciaModeracionHttpAdapter.RUTA + "): " + motivo);
    }
}
