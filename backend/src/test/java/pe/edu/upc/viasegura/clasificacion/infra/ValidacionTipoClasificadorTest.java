package pe.edu.upc.viasegura.clasificacion.infra;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@code CLASIFICACION_TIPO} con un valor que no elige ningun adaptador (NC-04),
 * o {@code http} sin una {@code CLASIFICACION_URL} usable (NC-04b): el
 * arranque falla nombrando la variable, no con un generico «No qualifying bean
 * of type ClasificadorDano» ni con cada clasificacion fallando en silencio.
 * Sin contexto de Spring: la validacion corre antes de crear cualquier bean.
 */
class ValidacionTipoClasificadorTest {

    private static ValidacionTipoClasificador con(MockEnvironment entorno) {
        ValidacionTipoClasificador validacion = new ValidacionTipoClasificador();
        validacion.setEnvironment(entorno);
        return validacion;
    }

    private static MockEnvironment http(String url) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.clasificacion.tipo", "http");
        return url == null ? entorno : entorno.withProperty("app.clasificacion.http.url", url);
    }

    @ParameterizedTest
    @ValueSource(strings = {"falso", "FALSO"})
    void elFalso_pasa_sinMirarLaUrl(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.clasificacion.tipo", valor);

        assertThatCode(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @Test
    void sinLaPropiedad_pasa() {
        assertThatCode(() -> con(new MockEnvironment()).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://inferencia.railway.internal:8000", "http://localhost:8090/",
            "https://inferencia.ciudadviva.test", "http://[fd12:3456::1]:8000"})
    void http_conUnaUrlHttpConHost_pasa(String url) {
        assertThatCode(() -> con(http(url)).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @Test
    void http_enMayusculas_pasaComoLaCondicionDelAdaptador() {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.clasificacion.tipo", "HTTP")
                .withProperty("app.clasificacion.http.url", "http://localhost:8090");

        assertThatCode(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @Test
    void http_sinUrl_noArrancaYNombraLaVariable() {
        for (MockEnvironment entorno : new MockEnvironment[] {http(null), http(""), http("  ")}) {
            assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageStartingWith("Con CLASIFICACION_TIPO=http falta CLASIFICACION_URL");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"inferencia.railway.internal:8000", "ftp://inferencia:8000", "http://", "http:/x",
            "http://inferencia .railway.internal"})
    void http_conUnaUrlSinEsquemaHttpOSinHost_noArrancaYLaRepite(String url) {
        assertThatThrownBy(() -> con(http(url)).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("CLASIFICACION_URL (app.clasificacion.http.url) no es una URL http(s)")
                .hasMessageContaining("'" + url + "'");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "falso ", "http ", "onnx", "fake"})
    void otroValor_noArrancaYNombraLaVariable(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.clasificacion.tipo", valor);

        assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CLASIFICACION_TIPO")
                .hasMessageContaining("'http'")
                .hasMessageContaining("'falso'");
    }
}
