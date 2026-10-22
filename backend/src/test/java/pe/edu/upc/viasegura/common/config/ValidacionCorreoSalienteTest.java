package pe.edu.upc.viasegura.common.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@code CORREO_TIPO} con un valor que no elige ningun adaptador de correo
 * (DEP-08): el arranque falla nombrando la variable y los valores admitidos,
 * no con el generico «required a bean of type CorreoSaliente». Sin base de
 * datos ni contexto de Spring. El arranque real con un valor no admitido lo
 * prueba {@code ArranqueCorreoIT}.
 */
class ValidacionCorreoSalienteTest {

    private static ValidacionCorreoSaliente con(MockEnvironment entorno) {
        ValidacionCorreoSaliente validacion = new ValidacionCorreoSaliente();
        validacion.setEnvironment(entorno);
        return validacion;
    }

    @ParameterizedTest
    @ValueSource(strings = {"smtp", "resend", "SMTP", "Resend"})
    void losValoresDeLosAdaptadores_pasan(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.correo.tipo", valor);

        assertThatCode(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @Test
    void sinLaPropiedad_pasa() {
        // Sin definir es smtp (matchIfMissing del adaptador SMTP).
        assertThatCode(() -> con(new MockEnvironment()).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"brevo", "", "resend ", "http", "mailhog"})
    void otroValor_noArrancaYNombraLaVariableYLosValoresAdmitidos(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.correo.tipo", valor);

        assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CORREO_TIPO")
                .hasMessageContaining("app.correo.tipo")
                .hasMessageContaining("'" + valor + "'")
                .hasMessageContaining("'resend'")
                .hasMessageContaining("'smtp'");
    }
}
