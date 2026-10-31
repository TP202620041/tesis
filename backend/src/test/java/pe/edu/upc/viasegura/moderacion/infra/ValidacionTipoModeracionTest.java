package pe.edu.upc.viasegura.moderacion.infra;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@code MODERACION_TIPO} con un valor que no elige ningun adaptador,
 * {@code http} sin una {@code MODERACION_URL} usable o un
 * {@code MODERACION_UMBRAL} fuera de rango (NC-10b): el arranque falla
 * nombrando la variable. Sin contexto de Spring: la validacion corre antes de
 * crear cualquier bean. El caso de {@code prod} sin la variable lo prueba
 * {@code ArranqueModeracionIT}.
 */
class ValidacionTipoModeracionTest {

    private static void validar(MockEnvironment entorno) {
        ValidacionTipoModeracion validacion = new ValidacionTipoModeracion();
        validacion.setEnvironment(entorno);
        validacion.postProcessBeanFactory(new DefaultListableBeanFactory());
    }

    private static MockEnvironment http(String url) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.moderacion.tipo", "http");
        return url == null ? entorno : entorno.withProperty("app.moderacion.http.url", url);
    }

    @Test
    void sinLaPropiedad_pasa() {
        assertThatCode(() -> validar(new MockEnvironment())).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ninguna", "NINGUNA"})
    void ninguna_pasa_sinMirarLaUrl(String valor) {
        assertThatCode(() -> validar(new MockEnvironment().withProperty("app.moderacion.tipo", valor)))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://inferencia.railway.internal:8000", "http://localhost:8010/",
            "https://inferencia.ciudadviva.test"})
    void http_conUnaUrlBase_pasa(String url) {
        assertThatCode(() -> validar(http(url))).doesNotThrowAnyException();
        assertThatCode(() -> validar(http(url).withProperty("app.moderacion.tipo", "HTTP")))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ninguno", "falso", "http ", "", "nsfw"})
    void unValorNoAdmitido_noArranca_yNombraLaVariable(String valor) {
        assertThatThrownBy(() -> validar(new MockEnvironment().withProperty("app.moderacion.tipo", valor)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MODERACION_TIPO")
                .hasMessageContaining("'http'")
                .hasMessageContaining("'ninguna'");
    }

    @Test
    void http_sinUrl_noArranca() {
        assertThatThrownBy(() -> validar(http(null)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("Con MODERACION_TIPO=http falta MODERACION_URL");
        assertThatThrownBy(() -> validar(http("  ")))
                .hasMessageStartingWith("Con MODERACION_TIPO=http falta MODERACION_URL");
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://inferencia:8000/v1", "http://inferencia:8000/v1/moderacion",
            "http://inferencia:8000?x=1", "http://inferencia:8000#a"})
    void http_conAlgoMasQueLaBase_noArranca(String url) {
        assertThatThrownBy(() -> validar(http(url)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("debe ser solo la base");
    }

    @ParameterizedTest
    @ValueSource(strings = {"inferencia:8000", "ftp://inferencia:8000", "http://", "no es una url"})
    void http_conUnaUrlQueNoEsHttpConHost_noArranca(String url) {
        assertThatThrownBy(() -> validar(http(url)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MODERACION_URL");
    }

    @Test
    void http_conUsuarioYContrasena_noRepiteLaUrl() {
        assertThatThrownBy(() -> validar(http("http://usuario:clave-secreta@inferencia:8000")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("clave-secreta");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0.5", "0.70", " 0.9 "})
    void umbralEnElRango_pasa(String umbral) {
        assertThatCode(() -> validar(new MockEnvironment().withProperty("app.moderacion.umbral", umbral)))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"0.49", "0.95", "1", "0", "-0.7", "0,70", "setenta", "NaN"})
    void umbralFueraDeRangoONoNumerico_noArranca(String umbral) {
        assertThatThrownBy(() -> validar(new MockEnvironment().withProperty("app.moderacion.tipo", "ninguna")
                        .withProperty("app.moderacion.umbral", umbral)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MODERACION_UMBRAL")
                .hasMessageContaining("entre 0.5 y 0.9");
    }
}
