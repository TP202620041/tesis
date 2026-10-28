package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.security.SecureRandom;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import pe.edu.upc.viasegura.ViaSeguraApplication;

/**
 * Arranque con el captcha del registro mal configurado (NC-08): no arranca.
 *
 * <p><b>Sin {@code CAPTCHA_TIPO} en el perfil {@code prod}.</b> Con el
 * {@code ninguno} de desarrollo, un despliegue que olvidara la variable
 * dejaria el registro sin captcha sin que nada lo advierta. (Que con
 * {@code CAPTCHA_TIPO=recaptcha} falte {@code CAPTCHA_SECRET} lo cubre
 * {@code RecaptchaV2AdapterTest}: ese fallo llega al crear el adaptador.)</p>
 *
 * <p><b>Con un valor que no elige ningun adaptador</b> ({@code hcaptcha}):
 * {@code auth/infra/ValidacionTipoCaptcha} lo rechaza antes de crear
 * ningun bean, con un mensaje que nombra la variable.</p>
 *
 * <p>Mismo montaje que {@code ArranqueCorreoIT}: la aplicacion real sin BD
 * (la URL apunta a un puerto cerrado) y todo lo demas obligatorio en prod por
 * argumento, para que el fallo sea el del captcha.</p>
 */
class ArranqueCaptchaIT {

    private static String secretoPropio() {
        byte[] clave = new byte[48];
        new SecureRandom().nextBytes(clave);
        return Base64.getEncoder().encodeToString(clave);
    }

    /** Todo lo obligatorio del perfil prod menos CAPTCHA_TIPO. */
    private static String[] argumentosDeProdSinTipoDeCaptcha() {
        return new String[] {
                "--spring.profiles.active=prod",
                "--security.jwt.secret=" + secretoPropio(),
                "--server.port=0",
                "--DB_URL=jdbc:postgresql://127.0.0.1:1/ninguna",
                "--DB_USERNAME=nadie",
                "--DB_PASSWORD=nada",
                "--CORS_ALLOWED_ORIGINS=https://pwa.ciudadviva.test",
                "--FOTOS_DIR=" + System.getProperty("java.io.tmpdir") + "/viasegura-test-fotos",
                "--FOTOS_ALMACEN=local",
                "--CORREO_TIPO=smtp",
                "--NOTIF_FROM=Ciudad Viva <no-reply@ciudadviva.test>",
        };
    }

    @Test
    void sinCaptchaTipo_elPerfilProdNoArranca() {
        // Si la maquina define CAPTCHA_TIPO, el escenario no se puede armar.
        assumeTrue(System.getenv("CAPTCHA_TIPO") == null, "CAPTCHA_TIPO definida en el entorno");

        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentosDeProdSinTipoDeCaptcha()))
                .rootCause()
                .hasMessageContaining("Could not resolve placeholder 'CAPTCHA_TIPO'");
    }

    @Test
    void conUnValorNoAdmitido_noArrancaAntesDeTocarLaBase() {
        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class).run(
                "--app.captcha.tipo=hcaptcha",
                "--security.jwt.secret=" + secretoPropio(),
                "--server.port=0",
                "--spring.datasource.url=jdbc:postgresql://127.0.0.1:1/ninguna"))
                .isInstanceOf(IllegalStateException.class)
                .hasNoCause()
                .hasMessageStartingWith("CAPTCHA_TIPO (app.captcha.tipo) tiene un valor no admitido: 'hcaptcha'");
    }
}
