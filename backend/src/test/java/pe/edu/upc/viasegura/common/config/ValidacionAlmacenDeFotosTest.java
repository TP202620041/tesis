package pe.edu.upc.viasegura.common.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@code FOTOS_ALMACEN} con un valor que no elige ningun adaptador de fotos
 * (DEP-12): el arranque falla nombrando la variable y los valores admitidos,
 * no con el generico «No qualifying bean of type FotoStorageService». Sin
 * base de datos ni contexto de Spring: la validacion corre antes de crear
 * cualquier bean. El arranque real con un valor no admitido lo prueba
 * {@code ArranqueAlmacenDeFotosIT}.
 */
class ValidacionAlmacenDeFotosTest {

    private static ValidacionAlmacenDeFotos con(MockEnvironment entorno) {
        ValidacionAlmacenDeFotos validacion = new ValidacionAlmacenDeFotos();
        validacion.setEnvironment(entorno);
        return validacion;
    }

    @ParameterizedTest
    @ValueSource(strings = {"local", "s3", "S3", "LOCAL"})
    void losValoresDeLosAdaptadores_pasan(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.storage.tipo", valor);

        assertThatCode(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @Test
    void sinLaPropiedad_pasa() {
        // Sin definir es local (matchIfMissing del adaptador local).
        assertThatCode(() -> con(new MockEnvironment()).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"r2", "", "s3 ", "minio", "disco"})
    void otroValor_noArrancaYNombraLaVariableYLosValoresAdmitidos(String valor) {
        MockEnvironment entorno = new MockEnvironment().withProperty("app.storage.tipo", valor);

        assertThatThrownBy(() -> con(entorno).postProcessBeanFactory(new DefaultListableBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FOTOS_ALMACEN")
                .hasMessageContaining("app.storage.tipo")
                .hasMessageContaining("'" + valor + "'")
                .hasMessageContaining("'s3'")
                .hasMessageContaining("'local'");
    }
}
