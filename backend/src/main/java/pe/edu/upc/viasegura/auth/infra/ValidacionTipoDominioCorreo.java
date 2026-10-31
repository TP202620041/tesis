package pe.edu.upc.viasegura.auth.infra;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Valida {@code app.dominio-correo.tipo} ({@code DOMINIO_CORREO_TIPO}) al
 * arrancar (NC-09), con el mismo criterio que {@link ValidacionTipoCaptcha}.
 *
 * <p>Los dos adaptadores se eligen con {@code @ConditionalOnProperty}:
 * {@code SinVerificacionDeDominioAdapter} con {@code ninguno} (o sin la
 * propiedad) y {@code DnsVerificadorDeDominioAdapter} con {@code dns}. Con
 * otro valor ({@code mx}, {@code dns } con un espacio, vacio) no se crearia
 * ninguno y el arranque fallaria con un generico «required a bean of type
 * VerificadorDeDominioDeCorreo» que no dice que variable revisar. Es un
 * {@link BeanFactoryPostProcessor} para que corra antes de crear cualquier
 * bean, y compara igual que la condicion: sin distinguir mayusculas y sin
 * recortar espacios.</p>
 */
@Component
public class ValidacionTipoDominioCorreo implements BeanFactoryPostProcessor, EnvironmentAware {

    static final String PROPIEDAD = "app.dominio-correo.tipo";

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
            return; // sin la propiedad: ninguno (matchIfMissing)
        }
        String valor = entorno.getProperty(PROPIEDAD);
        if (!"dns".equalsIgnoreCase(valor) && !"ninguno".equalsIgnoreCase(valor)) {
            throw new IllegalStateException(("DOMINIO_CORREO_TIPO (" + PROPIEDAD + ") tiene un valor no admitido:"
                    + " '%s'. Use 'dns' (consulta el MX del dominio, produccion) o 'ninguno' (desarrollo y tests).")
                    .formatted(valor));
        }
    }
}
