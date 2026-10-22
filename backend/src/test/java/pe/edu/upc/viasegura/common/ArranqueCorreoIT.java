package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.security.SecureRandom;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import pe.edu.upc.viasegura.ViaSeguraApplication;

/**
 * Con el perfil {@code prod}, el correo saliente no tiene valor por defecto
 * (DEP-08): sin {@code CORREO_TIPO} la aplicacion no arranca.
 *
 * <p>Por que: con el {@code smtp} de desarrollo, un despliegue que olvidara la
 * variable intentaria cada correo contra {@code localhost:1025} y fallaria en
 * silencio (solo un WARN por envio), sin que nada lo advierta al desplegar.
 * Mismo criterio que el resto de {@code application-prod.yml}: mejor que no
 * arranque. (Que con {@code CORREO_TIPO=resend} falte la clave o el remitente
 * lo cubre {@code ResendCorreoAdapterTest}: ese fallo llega al crear el
 * adaptador, despues de conectarse a la base, y aqui no hay base.)</p>
 *
 * <p>Arranca la aplicacion real sin BD (la URL apunta a un puerto cerrado):
 * la condicion de los adaptadores ({@code @ConditionalOnProperty} sobre
 * {@code app.correo.tipo}) se evalua al leer la configuracion, antes de abrir
 * una conexion. El resto de lo obligatorio en prod se pasa por argumento,
 * incluido {@code FOTOS_ALMACEN} (DEP-12) para que el fallo sea el del
 * correo aunque esa variable tambien sea obligatoria.</p>
 */
class ArranqueCorreoIT {

    /** Todo lo obligatorio del perfil prod menos CORREO_TIPO. */
    private static String[] argumentosDeProdSinTipoDeCorreo() {
        byte[] clave = new byte[48];
        new SecureRandom().nextBytes(clave);
        return new String[] {
                "--spring.profiles.active=prod",
                "--security.jwt.secret=" + Base64.getEncoder().encodeToString(clave),
                "--server.port=0",
                "--DB_URL=jdbc:postgresql://127.0.0.1:1/ninguna",
                "--DB_USERNAME=nadie",
                "--DB_PASSWORD=nada",
                "--CORS_ALLOWED_ORIGINS=https://pwa.ciudadviva.test",
                "--FOTOS_DIR=" + System.getProperty("java.io.tmpdir") + "/viasegura-test-fotos",
                "--FOTOS_ALMACEN=local",
                "--NOTIF_FROM=Ciudad Viva <no-reply@ciudadviva.test>",
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
}
