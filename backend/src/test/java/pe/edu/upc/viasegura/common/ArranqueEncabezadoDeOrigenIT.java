package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.SpringApplication;
import pe.edu.upc.viasegura.ViaSeguraApplication;

/**
 * Arranque del perfil {@code prod} con el encabezado de origen (DEP-14) mal
 * configurado: no arranca.
 *
 * <p><b>Sin {@code ORIGEN_SECRETO}.</b> Con el {@code ninguno} de desarrollo,
 * un despliegue que olvidara la variable volveria a atender las peticiones
 * que se saltan Cloudflare, sin que nada lo advierta. Mismo criterio que
 * {@code CAPTCHA_TIPO} y {@code CLASIFICACION_TIPO}
 * ({@code ArranqueCaptchaIT}, {@code ArranqueClasificacionIT}). Falla al
 * leer la configuracion, antes de crear ningun bean.</p>
 *
 * <p><b>Con un secreto que no sirve</b> (vacio o de menos de 32
 * caracteres): falla al construir el filtro, junto con el servidor web y
 * antes de conectarse a la base. Que el error de abajo sea el del secreto y
 * no uno de conexion lo prueba: la URL de la base apunta a un puerto cerrado.
 * Los demas casos (espacios, no ASCII, el anterior igual al vigente) los
 * cubre {@code EncabezadoDeOrigenFilterTest}.</p>
 *
 * <p>Mismo montaje que {@code ArranqueCaptchaIT}: la aplicacion real sin BD y
 * todo lo demas obligatorio en prod por argumento, para que el fallo sea el
 * del encabezado de origen.</p>
 */
class ArranqueEncabezadoDeOrigenIT {

    /** Todo lo obligatorio del perfil prod menos ORIGEN_SECRETO. */
    private static List<String> argumentosDeProdSinSecretoDeOrigen() {
        byte[] clave = new byte[48];
        new SecureRandom().nextBytes(clave);
        return new ArrayList<>(List.of(
                "--spring.profiles.active=prod",
                "--security.jwt.secret=" + Base64.getEncoder().encodeToString(clave),
                "--server.port=0",
                "--DB_URL=jdbc:postgresql://127.0.0.1:1/ninguna",
                "--DB_USERNAME=nadie",
                "--DB_PASSWORD=nada",
                "--CORS_ALLOWED_ORIGINS=https://pwa.ciudadviva.test",
                "--FOTOS_DIR=" + System.getProperty("java.io.tmpdir") + "/viasegura-test-fotos",
                "--FOTOS_ALMACEN=local",
                "--CORREO_TIPO=smtp",
                "--NOTIF_FROM=Ciudad Viva <no-reply@ciudadviva.test>",
                "--CAPTCHA_TIPO=ninguno",
                "--CLASIFICACION_TIPO=falso"));
    }

    private static String trazaCompleta(Throwable error) {
        StringWriter texto = new StringWriter();
        error.printStackTrace(new PrintWriter(texto));
        return texto.toString();
    }

    @Test
    void sinOrigenSecreto_elPerfilProdNoArranca() {
        // Si la maquina define ORIGEN_SECRETO, el escenario no se puede armar.
        assumeTrue(System.getenv("ORIGEN_SECRETO") == null, "ORIGEN_SECRETO definida en el entorno");

        // Falla al evaluar la condicion del filtro, al leer la configuracion y
        // antes de crear ningun bean: la excepcion llega sin envolver.
        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentosDeProdSinSecretoDeOrigen().toArray(String[]::new)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Could not resolve placeholder 'ORIGEN_SECRETO'");
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "''                                | ORIGEN_SECRETO esta vacia.",
            "secreto-corto-de-prueba-0123456   | ORIGEN_SECRETO es demasiado corto: se exigen al menos 32 caracteres."})
    void conUnSecretoQueNoSirve_noArrancaAntesDeTocarLaBase_niLoRepite(String secreto, String mensaje) {
        List<String> argumentos = argumentosDeProdSinSecretoDeOrigen();
        argumentos.add("--ORIGEN_SECRETO=" + secreto);

        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentos.toArray(String[]::new)))
                .satisfies(error -> {
                    if (!secreto.isEmpty()) {
                        assertThat(trazaCompleta(error)).doesNotContain(secreto);
                    }
                })
                .rootCause()
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith(mensaje);
    }
}
