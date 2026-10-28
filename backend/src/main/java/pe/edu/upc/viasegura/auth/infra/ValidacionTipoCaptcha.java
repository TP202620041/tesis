package pe.edu.upc.viasegura.auth.infra;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Valida {@code app.captcha.tipo} ({@code CAPTCHA_TIPO}) al arrancar (NC-08),
 * con el mismo criterio que {@code common/config/ValidacionCorreoSaliente}.
 *
 * <p><b>Vive en {@code auth/infra} y no en {@code common/config}</b>
 * (ARCHITECTURE.md §4.3): {@code common} es para lo transversal, y el captcha
 * solo lo usa el registro de {@code auth}. {@code ValidacionCorreoSaliente}
 * si esta en {@code common} porque el correo lo usan varios modulos. Es el
 * mismo criterio que {@code clasificacion/infra/ValidacionTipoClasificador}:
 * la validacion queda junto a los adaptadores que elige.</p>
 *
 * <p>Los dos adaptadores de captcha se eligen con {@code @ConditionalOnProperty}:
 * {@code SinCaptchaAdapter} con {@code ninguno} (o sin la propiedad) y
 * {@code RecaptchaV2Adapter} con {@code recaptcha}. Con otro valor
 * ({@code hcaptcha}, {@code recaptcha } con un espacio, vacio) no se crea
 * ninguno y el arranque fallaria con un generico «required a bean of type
 * VerificadorDeCaptcha» que no dice que variable revisar. Es un
 * {@link BeanFactoryPostProcessor} para que corra antes de crear cualquier
 * bean, y compara igual que la condicion: sin distinguir mayusculas y sin
 * recortar espacios.</p>
 */
@Component
public class ValidacionTipoCaptcha implements BeanFactoryPostProcessor, EnvironmentAware {

    static final String PROPIEDAD = "app.captcha.tipo";

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
        if (!"recaptcha".equalsIgnoreCase(valor) && !"ninguno".equalsIgnoreCase(valor)) {
            throw new IllegalStateException(("CAPTCHA_TIPO (" + PROPIEDAD + ") tiene un valor no admitido: '%s'."
                    + " Use 'recaptcha' (Google reCAPTCHA v2, produccion) o 'ninguno' (desarrollo y tests).")
                    .formatted(valor));
        }
    }
}
