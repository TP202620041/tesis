package pe.edu.upc.viasegura.moderacion;

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
 * Arranque del perfil {@code prod} con la moderacion mal configurada
 * (NC-10b): no arranca.
 *
 * <ul>
 *   <li><b>Sin {@code MODERACION_TIPO}.</b> Con el {@code ninguna} de
 *       desarrollo por defecto, un despliegue que olvidara la variable
 *       publicaria fotos sin revisar, y nada lo advertiria. Mismo criterio que
 *       {@code CLASIFICACION_TIPO} y {@code CAPTCHA_TIPO}: mejor que no
 *       arranque.</li>
 *   <li><b>Con un valor no admitido</b> ({@code nsfw}) o <b>con {@code http}
 *       y sin {@code MODERACION_URL}</b>: {@code ValidacionTipoModeracion} lo
 *       rechaza antes de crear ningun bean, con un mensaje que nombra la
 *       variable. (Las URL invalidas y el umbral los cubre
 *       {@code ValidacionTipoModeracionTest}.)</li>
 * </ul>
 *
 * <p>Arranca la aplicacion real sin BD (la URL apunta a un puerto cerrado):
 * la condicion de los adaptadores y las validaciones se evaluan al leer la
 * configuracion, antes de abrir una conexion. El resto de lo obligatorio en
 * prod se pasa por argumento, para que el fallo sea el de la moderacion.</p>
 */
class ArranqueModeracionIT {

    /** Todo lo obligatorio del perfil prod menos la moderacion. */
    private static List<String> argumentosDeProdSinModeracion() {
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
                "--CLASIFICACION_TIPO=falso",
                // DEP-14: obligatoria en prod. Un valor de prueba evidente.
                "--ORIGEN_SECRETO=secreto-de-origen-de-prueba-0123456789"));
    }

    @Test
    void sinModeracionTipo_elPerfilProdNoArranca() {
        // Si la maquina define MODERACION_TIPO, el escenario no se puede armar.
        assumeTrue(System.getenv("MODERACION_TIPO") == null, "MODERACION_TIPO definida en el entorno");

        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentosDeProdSinModeracion().toArray(String[]::new)))
                .rootCause()
                .hasMessageContaining("Could not resolve placeholder 'MODERACION_TIPO'");
    }

    @Test
    void conUnValorNoAdmitido_noArrancaAntesDeTocarLaBase() {
        List<String> argumentos = argumentosDeProdSinModeracion();
        argumentos.add("--MODERACION_TIPO=nsfw");

        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentos.toArray(String[]::new)))
                .isInstanceOf(IllegalStateException.class)
                .hasNoCause()
                .hasMessageStartingWith("MODERACION_TIPO (app.moderacion.tipo) tiene un valor no admitido: 'nsfw'");
    }

    @Test
    void conHttpSinUrl_noArrancaAntesDeTocarLaBase() {
        assumeTrue(System.getenv("MODERACION_URL") == null, "MODERACION_URL definida en el entorno");
        List<String> argumentos = argumentosDeProdSinModeracion();
        argumentos.add("--MODERACION_TIPO=http");

        // La URL de la base apunta a un puerto cerrado: si el fallo llegara
        // despues de conectarse, el mensaje seria el de la conexion.
        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentos.toArray(String[]::new)))
                .isInstanceOf(IllegalStateException.class)
                .hasNoCause()
                .hasMessageStartingWith("Con MODERACION_TIPO=http falta MODERACION_URL");
    }

    @Test
    void conUnUmbralFueraDeRango_noArrancaAntesDeTocarLaBase() {
        List<String> argumentos = argumentosDeProdSinModeracion();
        argumentos.add("--MODERACION_TIPO=ninguna");
        argumentos.add("--MODERACION_UMBRAL=0.95");

        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class)
                .run(argumentos.toArray(String[]::new)))
                .isInstanceOf(IllegalStateException.class)
                .hasNoCause()
                .hasMessageStartingWith("MODERACION_UMBRAL (app.moderacion.umbral) debe estar entre 0.5 y 0.9");
    }
}
