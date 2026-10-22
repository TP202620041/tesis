package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.security.SecureRandom;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import pe.edu.upc.viasegura.ViaSeguraApplication;

/**
 * Con el perfil {@code prod}, el almacenamiento de fotos no tiene valor por
 * defecto (DEP-12): sin {@code FOTOS_ALMACEN} la aplicacion no arranca.
 *
 * <p>Por que: con el {@code local} de desarrollo, un despliegue que olvidara
 * la variable guardaria las fotos en el disco del contenedor y las perderia
 * en el siguiente despliegue, sin ningun aviso. Mismo criterio que el resto
 * de {@code application-prod.yml}: mejor que no arranque. (Que con
 * {@code FOTOS_ALMACEN=s3} falte el endpoint, un bucket o el token lo cubre
 * {@code S3FotoStorageServiceTest}: ese fallo llega despues de conectarse a
 * la base, y aqui no hay base.)</p>
 *
 * <p>Arranca la aplicacion real sin BD (la URL apunta a un puerto cerrado):
 * la condicion del adaptador se evalua al leer la configuracion, antes de
 * abrir una conexion. El secreto JWT es uno propio, como en un despliegue
 * (SEC-03).</p>
 */
class ArranqueAlmacenDeFotosIT {

    /** Todo lo obligatorio del perfil prod menos FOTOS_ALMACEN. */
    private static String[] argumentosDeProdSinAlmacen() {
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
        };
    }

    @Test
    void sinFotosAlmacen_elPerfilProdNoArranca() {
        // Si la maquina define FOTOS_ALMACEN, el escenario no se puede armar.
        assumeTrue(System.getenv("FOTOS_ALMACEN") == null, "FOTOS_ALMACEN definida en el entorno");

        assertThatThrownBy(() -> new SpringApplication(ViaSeguraApplication.class).run(argumentosDeProdSinAlmacen()))
                .rootCause()
                .hasMessageContaining("Could not resolve placeholder 'FOTOS_ALMACEN'");
    }
}
