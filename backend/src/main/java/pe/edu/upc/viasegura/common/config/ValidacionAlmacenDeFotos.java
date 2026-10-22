package pe.edu.upc.viasegura.common.config;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Valida {@code app.storage.tipo} ({@code FOTOS_ALMACEN}) al arrancar (DEP-12).
 *
 * <p>Los dos adaptadores de fotos se eligen con {@code @ConditionalOnProperty}:
 * {@code LocalFotoStorageService} con {@code local} (o sin la propiedad) y
 * {@code S3FotoStorageService} con {@code s3}. Con cualquier otro valor
 * ({@code r2}, {@code S3 } con un espacio, vacio) no se crea ninguno, y el
 * arranque fallaba con un generico «No qualifying bean of type
 * FotoStorageService» que no dice que variable revisar.</p>
 *
 * <p>Es un {@link BeanFactoryPostProcessor} para que corra <b>antes</b> de
 * crear cualquier bean (y por lo tanto antes de ese error y de tocar la
 * base). Compara igual que la condicion de los adaptadores: sin distinguir
 * mayusculas y sin recortar espacios.</p>
 */
@Component
public class ValidacionAlmacenDeFotos implements BeanFactoryPostProcessor, EnvironmentAware {

    static final String PROPIEDAD = "app.storage.tipo";

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
            return; // sin la propiedad: local (matchIfMissing)
        }
        String valor = entorno.getProperty(PROPIEDAD);
        if (!"local".equalsIgnoreCase(valor) && !"s3".equalsIgnoreCase(valor)) {
            throw new IllegalStateException(("FOTOS_ALMACEN (" + PROPIEDAD + ") tiene un valor no admitido: '%s'."
                    + " Use 's3' (Cloudflare R2, produccion) o 'local' (disco del contenedor).").formatted(valor));
        }
    }
}
