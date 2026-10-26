package pe.edu.upc.viasegura.clasificacion.infra;

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
 * {@code @ConditionalOnProperty}. Con un valor desconocido no se crea
 * ninguno y el arranque fallaba con un generico «No qualifying bean of type
 * ClasificadorDano», que no dice que variable revisar. Hoy solo existe
 * {@code falso}; {@code http} llega con NC-04b, que lo agrega aqui junto con
 * su adaptador.</p>
 *
 * <p>Es un {@link BeanFactoryPostProcessor} para que corra <b>antes</b> de
 * crear cualquier bean. Compara como la condicion del adaptador: sin
 * distinguir mayusculas y sin recortar espacios.</p>
 */
@Component
public class ValidacionTipoClasificador implements BeanFactoryPostProcessor, EnvironmentAware {

    static final String PROPIEDAD = "app.clasificacion.tipo";

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
            throw new IllegalStateException("CLASIFICACION_TIPO (" + PROPIEDAD + ") = 'http' todavia no esta"
                    + " disponible: el adaptador del servicio de inferencia llega con NC-04b. Use 'falso'.");
        }
        if (!"falso".equalsIgnoreCase(valor)) {
            throw new IllegalStateException(("CLASIFICACION_TIPO (" + PROPIEDAD + ") tiene un valor no admitido:"
                    + " '%s'. Use 'falso' (respuestas fijas por configuracion).").formatted(valor));
        }
    }
}
