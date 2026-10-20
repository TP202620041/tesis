package pe.edu.upc.viasegura.notificaciones;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import pe.edu.upc.viasegura.notificaciones.domain.DestinoPush;
import pe.edu.upc.viasegura.notificaciones.domain.ResultadoEnvioPush;
import pe.edu.upc.viasegura.notificaciones.infra.ZerodepWebPushAdapter;

/**
 * Adaptador Web Push real (US-21) sin red: carga de claves VAPID en el
 * formato de {@code npx web-push generate-vapid-keys}, arranque sin claves y
 * clasificacion de respuestas. El envio a un servicio real no se prueba.
 */
class ZerodepWebPushAdapterTest {

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    /** Par P-256: [0] publica sin comprimir (65 bytes), [1] escalar privado (32 bytes), en base64url. */
    private static String[] parP256() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair par = gen.generateKeyPair();
        ECPublicKey pub = (ECPublicKey) par.getPublic();
        byte[] sinComprimir = new byte[65];
        sinComprimir[0] = 0x04;
        copiar32(pub.getW().getAffineX(), sinComprimir, 1);
        copiar32(pub.getW().getAffineY(), sinComprimir, 33);
        byte[] privada = new byte[32];
        copiar32(((ECPrivateKey) par.getPrivate()).getS(), privada, 0);
        return new String[] {B64.encodeToString(sinComprimir), B64.encodeToString(privada)};
    }

    private static void copiar32(BigInteger n, byte[] destino, int desde) {
        byte[] b = n.toByteArray();
        int largo = Math.min(b.length, 32);
        System.arraycopy(b, b.length - largo, destino, desde + 32 - largo, largo);
    }

    @Test
    void sinClaves_noConfigurado_yArrancaIgual() {
        ZerodepWebPushAdapter adapter = new ZerodepWebPushAdapter("", "", "", 1, 5);
        assertThat(adapter.estaConfigurado()).isFalse();
        assertThat(adapter.clavePublica()).isEmpty();
        assertThat(adapter.enviar(new DestinoPush("https://fcm.googleapis.com/x", "a", "b"),
                new byte[0], "t")).isEqualTo(ResultadoEnvioPush.ERROR);
    }

    @Test
    void clavesInvalidas_noConfigurado_sinExcepcion() {
        assertThat(new ZerodepWebPushAdapter("no-es-una-clave", "tampoco", "mailto:a@b.pe", 1, 5)
                .estaConfigurado()).isFalse();
    }

    @Test
    void sujetoSinMailtoNiHttps_noConfigurado() throws Exception {
        String[] par = parP256();
        assertThat(new ZerodepWebPushAdapter(par[0], par[1], "soporte@viasegura.pe", 1, 5)
                .estaConfigurado()).isFalse();
    }

    @Test
    void clavesValidas_configurado_yExponeLaPublica() throws Exception {
        String[] par = parP256();
        ZerodepWebPushAdapter adapter = new ZerodepWebPushAdapter(par[0], par[1], "mailto:soporte@viasegura.pe", 1, 5);
        assertThat(adapter.estaConfigurado()).isTrue();
        assertThat(adapter.clavePublica()).contains(par[0]);
    }

    @Test
    void envioAUnEndpointInalcanzable_esError_noLanza() throws Exception {
        // Firma y cifra de verdad; la conexion se rechaza en local, sin salir a internet.
        String[] vapid = parP256();
        String[] navegador = parP256();
        byte[] auth = new byte[16];
        new SecureRandom().nextBytes(auth);
        ZerodepWebPushAdapter adapter = new ZerodepWebPushAdapter(vapid[0], vapid[1], "mailto:soporte@viasegura.pe", 1, 2);

        ResultadoEnvioPush r = adapter.enviar(
                new DestinoPush("https://127.0.0.1:9/push", navegador[0], B64.encodeToString(auth)),
                "{\"titulo\":\"x\"}".getBytes(StandardCharsets.UTF_8), "reporte-1");

        assertThat(r).isEqualTo(ResultadoEnvioPush.ERROR);
    }

    @Test
    void clasificaLasRespuestasDelServicioDePush() {
        assertThat(ZerodepWebPushAdapter.clasificar(201)).isEqualTo(ResultadoEnvioPush.ENTREGADO);
        assertThat(ZerodepWebPushAdapter.clasificar(404)).isEqualTo(ResultadoEnvioPush.SUSCRIPCION_CADUCADA);
        assertThat(ZerodepWebPushAdapter.clasificar(410)).isEqualTo(ResultadoEnvioPush.SUSCRIPCION_CADUCADA);
        assertThat(ZerodepWebPushAdapter.clasificar(413)).isEqualTo(ResultadoEnvioPush.ERROR);
        assertThat(ZerodepWebPushAdapter.clasificar(429)).isEqualTo(ResultadoEnvioPush.ERROR);
        assertThat(ZerodepWebPushAdapter.clasificar(500)).isEqualTo(ResultadoEnvioPush.ERROR);
    }
}
