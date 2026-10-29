package pe.edu.upc.viasegura.clasificacion;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import pe.edu.upc.viasegura.ViaSeguraApplication;

/**
 * Arranque del perfil {@code prod} con la clasificacion mal configurada
 * (NC-04b): no arranca.
 *
 * <p><b>Sin {@code CLASIFICACION_TIPO}.</b> Con el {@code falso} de
 * desarrollo por defecto, un despliegue que olvidara la variable quedaria con
 * la clasificacion apagada, y nada lo advertiria: cualquier falla del
 * adaptador tambien termina en «sin sugerencia». Mismo criterio que
 * {@code FOTOS_ALMACEN}, {@code CORREO_TIPO} y {@code CAPTCHA_TIPO}
 * ({@code ArranqueAlmacenDeFotosIT}, {@code ArranqueCorreoIT},
 * {@code ArranqueCaptchaIT}): mejor que no arranque.</p>
 *
 * <p><b>Con {@code http} y sin {@code CLASIFICACION_URL}.</b>
 * {@code ValidacionTipoClasificador} lo rechaza antes de crear ningun bean,
 * con un mensaje que nombra la variable. (Los demas valores y URL invalidas
 * los cubre {@code ValidacionTipoClasificadorTest}.)</p>
 *
 * <p>Arranca la aplicacion real sin BD (la URL apunta a un puerto cerrado):
 * la condicion de los adaptadores y las validaciones se evaluan al leer la
 * configuracion, antes de abrir una conexion. El resto de lo obligatorio en
 * prod se pasa por argumento, para que el fallo sea el de la clasificacion.</p>
 */
class ArranqueClasificacionIT {

    /** Todo lo obligatorio del perfil prod menos la clasificacion. */
    private static List<String> argumentosDeProdSinClasificacion() {
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
                // DEP-14: obligatoria en prod. Un valor de prueba evidente.
                "--ORIGEN_SECRETO=secreto-de-origen-de-prueba-0123456789"));
    }

    @Test
    void sinClasificacionTipo_elPerfilProdNoArranca() {
        // Si la maquina define CLASIFICACION_TIPO, el escenario no se puede armar.
        assumeTrue(System.getenv("CLASIFICACION_TIPO") == null, "CLASIFICACION_TIPO definida en el entorno");

        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentosDeProdSinClasificacion().toArray(String[]::new)))
                .rootCause()
                .hasMessageContaining("Could not resolve placeholder 'CLASIFICACION_TIPO'");
    }

    @Test
    void conHttpSinUrl_noArrancaAntesDeTocarLaBase() {
        assumeTrue(System.getenv("CLASIFICACION_URL") == null, "CLASIFICACION_URL definida en el entorno");
        List<String> argumentos = argumentosDeProdSinClasificacion();
        argumentos.add("--CLASIFICACION_TIPO=http");

        // La URL de la base apunta a un puerto cerrado: si el fallo llegara
        // despues de conectarse, el mensaje seria el de la conexion. La
        // excepcion sale tal cual del refresh del contexto, sin envolver
        // (ValidacionTipoClasificador, un BeanFactoryPostProcessor).
        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentos.toArray(String[]::new)))
                .isInstanceOf(IllegalStateException.class)
                .hasNoCause()
                .hasMessageStartingWith("Con CLASIFICACION_TIPO=http falta CLASIFICACION_URL");
    }
}
