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
 * {@code TurnstileAdapter} con {@code turnstile} (NC-08b). Con otro valor
 * ({@code hcaptcha}, {@code turnstile } con un espacio, vacio) no se crea
 * ninguno y el arranque fallaria con un generico «required a bean of type
 * VerificadorDeCaptcha» que no dice que variable revisar. Es un
 * {@link BeanFactoryPostProcessor} para que corra antes de crear cualquier
 * bean, y compara igual que la condicion: sin distinguir mayusculas y sin
 * recortar espacios.</p>
 *
 * <p>{@code recaptcha} fue el valor de produccion de NC-08 hasta que el
 * usuario eligio Turnstile (28/10). Ya no existe, y el mensaje lo dice para
 * que un despliegue con la variable vieja sepa que cambiar.</p>
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
        if (!"turnstile".equalsIgnoreCase(valor) && !"ninguno".equalsIgnoreCase(valor)) {
            String aviso = "recaptcha".equalsIgnoreCase(valor)
                    ? " reCAPTCHA se reemplazo por Turnstile (NC-08b): CAPTCHA_SECRET debe ser la clave secreta"
                            + " del widget de Turnstile."
                    : "";
            throw new IllegalStateException(("CAPTCHA_TIPO (" + PROPIEDAD + ") tiene un valor no admitido: '%s'."
                    + " Use 'turnstile' (Cloudflare Turnstile, produccion) o 'ninguno' (desarrollo y tests).%s")
                    .formatted(valor, aviso));
        }
    }
}
