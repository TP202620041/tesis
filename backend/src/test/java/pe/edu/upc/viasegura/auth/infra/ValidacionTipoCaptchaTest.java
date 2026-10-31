package pe.edu.upc.viasegura.auth.infra;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@code CAPTCHA_TIPO} con un valor que no elige ningun adaptador de captcha
 * (NC-08): el arranque falla nombrando la variable y los valores admitidos.
 * Sin base de datos ni contexto de Spring; el arranque real lo prueba
 * {@code ArranqueCaptchaIT}.
 */
class ValidacionTipoCaptchaTest {

    private static ValidacionTipoCaptcha con(MockEnvironment entorno) {
        ValidacionTipoCaptcha validacion = new ValidacionTipoCaptcha();
        validacion.setEnvironment(entorno);
        return validacion;
    }

    @ParameterizedTest
    @ValueSource(strings = {"turnstile", "ninguno", "TURNSTILE", "Ninguno"})
    void losValoresDeLosAdaptadores_pasan(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.captcha.tipo", valor);

        assertThatCode(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @Test
    void sinLaPropiedad_pasa() {
        // Sin definir es ninguno (matchIfMissing de SinCaptchaAdapter).
        assertThatCode(() -> con(new MockEnvironment()).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"hcaptcha", "", "turnstile ", "recaptcha", "v3", "no"})
    void otroValor_noArrancaYNombraLaVariableYLosValoresAdmitidos(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.captcha.tipo", valor);

        assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CAPTCHA_TIPO")
                .hasMessageContaining("app.captcha.tipo")
                .hasMessageContaining("'" + valor + "'")
                .hasMessageContaining("'turnstile'")
                .hasMessageContaining("'ninguno'");
    }

    @ParameterizedTest
    @ValueSource(strings = {"recaptcha", "reCAPTCHA"})
    void recaptcha_yaNoExisteYElMensajeDiceQueCambiar(String valor) {
        // NC-08b: el valor de produccion de NC-08 hasta el 28/10.
        MockEnvironment entorno = new MockEnvironment().withProperty("app.captcha.tipo", valor);

        assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("reCAPTCHA se reemplazo por Turnstile")
                .hasMessageContaining("CAPTCHA_SECRET");
    }

    @Test
    void otroValor_noMencionaReCaptcha() {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.captcha.tipo", "hcaptcha");

        assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .message().doesNotContain("reCAPTCHA");
    }
}
