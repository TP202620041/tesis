package pe.edu.upc.viasegura.clasificacion.infra;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@code CLASIFICACION_TIPO} con un valor que no elige ningun adaptador (NC-04):
 * el arranque falla nombrando la variable, no con un generico «No qualifying
 * bean of type ClasificadorDano». Sin contexto de Spring: la validacion corre
 * antes de crear cualquier bean.
 */
class ValidacionTipoClasificadorTest {

    private static ValidacionTipoClasificador con(MockEnvironment entorno) {
        ValidacionTipoClasificador validacion = new ValidacionTipoClasificador();
        validacion.setEnvironment(entorno);
        return validacion;
    }

    @ParameterizedTest
    @ValueSource(strings = {"falso", "FALSO"})
    void elFalso_pasa(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.clasificacion.tipo", valor);

        assertThatCode(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @Test
    void sinLaPropiedad_pasa() {
        assertThatCode(() -> con(new MockEnvironment()).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @Test
    void http_todaviaNoExiste_yLoDice() {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.clasificacion.tipo", "http");

        assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CLASIFICACION_TIPO")
                .hasMessageContaining("NC-04b");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "falso ", "onnx", "fake"})
    void otroValor_noArrancaYNombraLaVariable(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.clasificacion.tipo", valor);

        assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CLASIFICACION_TIPO")
                .hasMessageContaining("'falso'");
    }
}
