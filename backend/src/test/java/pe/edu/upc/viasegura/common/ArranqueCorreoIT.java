package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.security.SecureRandom;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import pe.edu.upc.viasegura.ViaSeguraApplication;

/**
 * Arranque con el correo mal configurado (DEP-08): no arranca.
 *
 * <p><b>Sin {@code CORREO_TIPO} en el perfil {@code prod}.</b> Con el
 * {@code smtp} de desarrollo, un despliegue que olvidara la variable
 * intentaria cada correo contra {@code localhost:1025} y fallaria en silencio
 * (solo un WARN por envio), sin que nada lo advierta al desplegar. Mismo
 * criterio que el resto de {@code application-prod.yml}: mejor que no
 * arranque. (Que con {@code CORREO_TIPO=resend} falte la clave o el remitente
 * lo cubre {@code ResendCorreoAdapterTest}: ese fallo llega al crear el
 * adaptador, despues de conectarse a la base, y aqui no hay base.)</p>
 *
 * <p><b>Con un valor que no elige ningun adaptador</b> ({@code brevo}):
 * {@code common/config/ValidacionCorreoSaliente} lo rechaza antes de crear
 * ningun bean, con un mensaje que nombra la variable, como
 * {@code ValidacionAlmacenDeFotos} con {@code FOTOS_ALMACEN} (DEP-12).</p>
 *
 * <p>Arranca la aplicacion real sin BD (la URL apunta a un puerto cerrado):
 * la condicion de los adaptadores ({@code @ConditionalOnProperty} sobre
 * {@code app.correo.tipo}) y las validaciones se evaluan al leer la
 * configuracion, antes de abrir una conexion. El resto de lo obligatorio en
 * prod se pasa por argumento, incluidos {@code FOTOS_ALMACEN} (valido para
 * {@code ValidacionAlmacenDeFotos}), {@code CAPTCHA_TIPO} (NC-08) y
 * {@code CLASIFICACION_TIPO} (NC-04b), para que el fallo sea el del
 * correo.</p>
 */
class ArranqueCorreoIT {

    private static String secretoPropio() {
        byte[] clave = new byte[48];
        new SecureRandom().nextBytes(clave);
        return Base64.getEncoder().encodeToString(clave);
    }

    /** Todo lo obligatorio del perfil prod menos CORREO_TIPO. */
    private static String[] argumentosDeProdSinTipoDeCorreo() {
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
                "--NOTIF_FROM=Ciudad Viva <no-reply@ciudadviva.test>",
                "--CAPTCHA_TIPO=ninguno",
                "--CLASIFICACION_TIPO=falso",
        };
    }

    @Test
    void sinCorreoTipo_elPerfilProdNoArranca() {
        // Si la maquina define CORREO_TIPO, el escenario no se puede armar.
        assumeTrue(System.getenv("CORREO_TIPO") == null, "CORREO_TIPO definida en el entorno");

        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentosDeProdSinTipoDeCorreo()))
                .rootCause()
                .hasMessageContaining("Could not resolve placeholder 'CORREO_TIPO'");
    }

    @Test
    void conUnValorNoAdmitido_noArrancaAntesDeTocarLaBase() {
        // La URL apunta a un puerto cerrado: si el fallo llegara despues de
        // conectarse a la base, el mensaje seria el de la conexion. La
        // excepcion sale tal cual del refresh del contexto, sin envolver
        // (ValidacionCorreoSaliente, un BeanFactoryPostProcessor).
        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class).run(
                "--app.correo.tipo=brevo",
                "--security.jwt.secret=" + secretoPropio(),
                "--server.port=0",
                "--spring.datasource.url=jdbc:postgresql://127.0.0.1:1/ninguna"))
                .isInstanceOf(IllegalStateException.class)
                .hasNoCause()
                .hasMessageStartingWith("CORREO_TIPO (app.correo.tipo) tiene un valor no admitido: 'brevo'");
    }
}
