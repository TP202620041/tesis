package pe.edu.upc.viasegura.common.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;
import pe.edu.upc.viasegura.ViaSeguraApplication;

/**
 * {@code FOTOS_ALMACEN} con un valor que no elige ningun adaptador de fotos
 * (DEP-12): el arranque falla nombrando la variable y los valores admitidos,
 * no con el generico «No qualifying bean of type FotoStorageService». Sin
 * base de datos: la validacion corre antes de crear cualquier bean.
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

    @Test
    void laAplicacionReal_noArrancaConUnValorNoAdmitido_antesDeTocarLaBase() {
        byte[] clave = new byte[48];
        new SecureRandom().nextBytes(clave);

        // La URL apunta a un puerto cerrado: si el fallo llegara despues de
        // conectarse a la base, el mensaje seria el de la conexion. La
        // excepcion sale tal cual del refresh del contexto, sin envolver.
        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class).run(
                "--app.storage.tipo=r2",
                "--security.jwt.secret=" + Base64.getEncoder().encodeToString(clave),
                "--server.port=0",
                "--spring.datasource.url=jdbc:postgresql://127.0.0.1:1/ninguna"))
                .isInstanceOf(IllegalStateException.class)
                .hasNoCause()
                .hasMessageStartingWith("FOTOS_ALMACEN (app.storage.tipo) tiene un valor no admitido: 'r2'");
    }
}
