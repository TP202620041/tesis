package pe.edu.upc.viasegura.auth.infra;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@code DOMINIO_CORREO_TIPO} con un valor que no elige ningun adaptador
 * (NC-09): el arranque falla nombrando la variable y los valores admitidos.
 * Sin base de datos ni contexto de Spring.
 */
class ValidacionTipoDominioCorreoTest {

    private static ValidacionTipoDominioCorreo con(MockEnvironment entorno) {
        ValidacionTipoDominioCorreo validacion = new ValidacionTipoDominioCorreo();
        validacion.setEnvironment(entorno);
        return validacion;
    }

    @ParameterizedTest
    @ValueSource(strings = {"dns", "ninguno", "DNS", "Ninguno"})
    void losValoresDeLosAdaptadores_pasan(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.dominio-correo.tipo", valor);

        assertThatCode(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @Test
    void sinLaPropiedad_pasa() {
        // Sin definir es ninguno (matchIfMissing de SinVerificacionDeDominioAdapter).
        assertThatCode(() -> con(new MockEnvironment()).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"mx", "", "dns ", "smtp", "si"})
    void otroValor_noArrancaYNombraLaVariableYLosValoresAdmitidos(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.dominio-correo.tipo", valor);

        assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DOMINIO_CORREO_TIPO")
                .hasMessageContaining("app.dominio-correo.tipo")
                .hasMessageContaining("'" + valor + "'")
                .hasMessageContaining("'dns'")
                .hasMessageContaining("'ninguno'");
    }
}
