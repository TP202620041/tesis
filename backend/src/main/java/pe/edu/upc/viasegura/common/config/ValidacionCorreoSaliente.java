package pe.edu.upc.viasegura.common.config;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Valida {@code app.correo.tipo} ({@code CORREO_TIPO}) al arrancar (DEP-08),
 * con el mismo criterio que {@link ValidacionAlmacenDeFotos} para las fotos.
 *
 * <p>Los dos adaptadores de correo se eligen con {@code @ConditionalOnProperty}:
 * {@code SmtpCorreoAdapter} con {@code smtp} (o sin la propiedad) y
 * {@code ResendCorreoAdapter} con {@code resend}. Con cualquier otro valor
 * ({@code brevo}, {@code resend } con un espacio, vacio) no se crea ninguno, y
 * el arranque fallaria con un generico «required a bean of type
 * CorreoSaliente that could not be found» que no dice que variable revisar.</p>
 *
 * <p>Es un {@link BeanFactoryPostProcessor} para que corra <b>antes</b> de
 * crear cualquier bean (y por lo tanto antes de ese error y de tocar la
 * base). Compara igual que la condicion de los adaptadores: sin distinguir
 * mayusculas y sin recortar espacios.</p>
 */
@Component
public class ValidacionCorreoSaliente implements BeanFactoryPostProcessor, EnvironmentAware {

    static final String PROPIEDAD = "app.correo.tipo";

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
            return; // sin la propiedad: smtp (matchIfMissing)
        }
        String valor = entorno.getProperty(PROPIEDAD);
        if (!"smtp".equalsIgnoreCase(valor) && !"resend".equalsIgnoreCase(valor)) {
            throw new IllegalStateException(("CORREO_TIPO (" + PROPIEDAD + ") tiene un valor no admitido: '%s'."
                    + " Use 'resend' (API HTTP de Resend, produccion) o 'smtp' (Mailhog en local, GreenMail en"
                    + " los tests).").formatted(valor));
        }
    }
}
