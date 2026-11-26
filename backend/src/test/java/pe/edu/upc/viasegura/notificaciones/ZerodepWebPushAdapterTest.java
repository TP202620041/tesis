package pe.edu.upc.viasegura.notificaciones;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.Timeout.ThreadMode;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import pe.edu.upc.viasegura.notificaciones.domain.DestinoPush;
import pe.edu.upc.viasegura.notificaciones.domain.ResultadoEnvioPush;
import pe.edu.upc.viasegura.notificaciones.infra.ZerodepWebPushAdapter;

/**
 * Adaptador Web Push real (US-21) sin red: carga de claves VAPID en el
 * formato de {@code npx web-push generate-vapid-keys}, arranque sin claves y
 * clasificacion de respuestas. El envio a un servicio real no se prueba: el
 * diagnostico de un rechazo se prueba contra un servidor HTTP local.
 */
@ExtendWith(OutputCaptureExtension.class)
class ZerodepWebPushAdapterTest {

    /** La parte secreta del endpoint, que nunca debe llegar al log. */
    private static final String RUTA_SECRETA = "/push/token-secreto-del-dispositivo-abc123";

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

    // --- Diagnostico de rechazos contra un servidor local ---------------------

    /** Responde {@code status} con {@code cuerpo} y envia una vez a ese servidor. */
    private static ResultadoEnvioPush enviarAUnServidorQueResponde(int status, String cuerpo) throws Exception {
        HttpServer local = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        local.createContext("/push", intercambio -> {
            intercambio.getRequestBody().readAllBytes();
            byte[] bytes = cuerpo.getBytes(StandardCharsets.UTF_8);
            intercambio.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
            try (OutputStream salida = intercambio.getResponseBody()) {
                salida.write(bytes);
            }
        });
        local.start();
        try {
            String[] vapid = parP256();
            String[] navegador = parP256();
            byte[] auth = new byte[16];
            new SecureRandom().nextBytes(auth);
            ZerodepWebPushAdapter adapter = new ZerodepWebPushAdapter(
                    vapid[0], vapid[1], "mailto:soporte@viasegura.pe", 1, 3);
            return adapter.enviar(
                    new DestinoPush("http://127.0.0.1:" + local.getAddress().getPort() + RUTA_SECRETA,
                            navegador[0], B64.encodeToString(auth)),
                    "{\"titulo\":\"x\"}".getBytes(StandardCharsets.UTF_8), "reporte-1");
        } finally {
            local.stop(0);
        }
    }

    @Test
    @Timeout(value = 15, unit = TimeUnit.SECONDS, threadMode = ThreadMode.SEPARATE_THREAD)
    void un400ConMotivoJson_dejaHostEstadoYMotivoEnElLog_sinElEndpoint(CapturedOutput salida) throws Exception {
        ResultadoEnvioPush r = enviarAUnServidorQueResponde(400, "{\"reason\":\"BadJwtToken\"}");

        assertThat(r).isEqualTo(ResultadoEnvioPush.ERROR);
        assertThat(salida.getOut())
                .contains("WARN")
                .contains("El servicio de push 127.0.0.1 rechazo el envio (HTTP 400, motivo: {\"reason\":\"BadJwtToken\"})")
                .doesNotContain(RUTA_SECRETA)
                .doesNotContain("token-secreto-del-dispositivo");
    }

    @Test
    @Timeout(value = 15, unit = TimeUnit.SECONDS, threadMode = ThreadMode.SEPARATE_THREAD)
    void un403_sigueExplicandoLaRotacionDeClaves_yAhoraDaElMotivo(CapturedOutput salida) throws Exception {
        ResultadoEnvioPush r = enviarAUnServidorQueResponde(403, "{\"reason\":\"BadJwtToken\"}");

        assertThat(r).isEqualTo(ResultadoEnvioPush.ERROR);
        assertThat(salida.getOut())
                .contains("rechazo la firma VAPID (HTTP 403, motivo: {\"reason\":\"BadJwtToken\"})")
                .contains("si se rotaron las claves")
                .doesNotContain(RUTA_SECRETA);
    }

    @Test
    @Timeout(value = 15, unit = TimeUnit.SECONDS, threadMode = ThreadMode.SEPARATE_THREAD)
    void unCuerpoLargoConSaltosDeLinea_llegaTruncadoYEnUnaSolaLinea(CapturedOutput salida) throws Exception {
        String inyeccion = "motivo\r\n2026-11-25 WARN falso: linea inyectada"
                + (char) 0x2028 + (char) 0x0000 + "x".repeat(5_000);

        ResultadoEnvioPush r = enviarAUnServidorQueResponde(500, inyeccion);

        assertThat(r).isEqualTo(ResultadoEnvioPush.ERROR);
        String linea = salida.getOut().lines()
                .filter(l -> l.contains("rechazo el envio (HTTP 500"))
                .findFirst().orElseThrow();
        assertThat(linea).contains("motivo: motivo 2026-11-25 WARN falso: linea inyectada x");
        assertThat(salida.getOut()).doesNotContain("\n2026-11-25 WARN falso");
        String motivo = linea.substring(linea.indexOf("motivo: ") + "motivo: ".length(), linea.lastIndexOf(')'));
        assertThat(motivo).endsWith("...")
                .hasSize(ZerodepWebPushAdapter.MAX_CARACTERES_MOTIVO + "...".length());
    }

    @Test
    @Timeout(value = 15, unit = TimeUnit.SECONDS, threadMode = ThreadMode.SEPARATE_THREAD)
    void un429SinCuerpo_loDice(CapturedOutput salida) throws Exception {
        assertThat(enviarAUnServidorQueResponde(429, "")).isEqualTo(ResultadoEnvioPush.ERROR);
        assertThat(salida.getOut()).contains("rechazo el envio (HTTP 429, motivo: (sin cuerpo))");
    }

    @Test
    @Timeout(value = 15, unit = TimeUnit.SECONDS, threadMode = ThreadMode.SEPARATE_THREAD)
    void un201_esEntregado_yNoDejaWarn(CapturedOutput salida) throws Exception {
        assertThat(enviarAUnServidorQueResponde(201, "")).isEqualTo(ResultadoEnvioPush.ENTREGADO);
        assertThat(salida.getOut()).doesNotContain("WARN").doesNotContain("rechazo");
    }

    @Test
    @Timeout(value = 15, unit = TimeUnit.SECONDS, threadMode = ThreadMode.SEPARATE_THREAD)
    void un410_esCaducada_yNoDejaWarn(CapturedOutput salida) throws Exception {
        assertThat(enviarAUnServidorQueResponde(410, "gone")).isEqualTo(ResultadoEnvioPush.SUSCRIPCION_CADUCADA);
        assertThat(salida.getOut()).doesNotContain("WARN").doesNotContain("rechazo");
    }

    @Test
    void motivoParaLog_saneaYAcota() {
        assertThat(ZerodepWebPushAdapter.motivoParaLog(null)).isEqualTo("(sin cuerpo)");
        assertThat(ZerodepWebPushAdapter.motivoParaLog(" \r\n\t ")).isEqualTo("(sin cuerpo)");
        assertThat(ZerodepWebPushAdapter.motivoParaLog("a\r\nb" + (char) 0x1b + "[31mc" + (char) 0x2029 + "d  "))
                .isEqualTo("a b [31mc d");
        assertThat(ZerodepWebPushAdapter.motivoParaLog("y".repeat(200))).isEqualTo("y".repeat(200));
        assertThat(ZerodepWebPushAdapter.motivoParaLog("y".repeat(201))).isEqualTo("y".repeat(200) + "...");
    }
}
