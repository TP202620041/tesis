package pe.edu.upc.viasegura.notificaciones;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.net.http.HttpRequest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import pe.edu.upc.viasegura.notificaciones.domain.DestinoPush;
import pe.edu.upc.viasegura.notificaciones.infra.ZerodepWebPushAdapter;

/**
 * Interoperabilidad criptografica del envio Web Push (US-21), sin red.
 *
 * <p>Comprueba lo que hace la libreria ({@code zerodep-web-push-java}) con
 * una implementacion independiente escrita aqui solo con el JDK:</p>
 * <ul>
 *   <li><b>RFC 8291 / RFC 8188</b>: el "navegador" (un par P-256 y un
 *       {@code auth} generados en el test) descifra el cuerpo
 *       {@code aes128gcm} con ECDH + HKDF-SHA-256 + AES-128-GCM y recupera
 *       el texto exacto;</li>
 *   <li><b>RFC 8292</b>: la firma ES256 del JWT de
 *       {@code Authorization: vapid t=...,k=...} verifica con la clave
 *       publica VAPID, y sus claims ({@code aud}, {@code exp}, {@code sub})
 *       son los esperados.</li>
 * </ul>
 * Si una version futura de la libreria rompiera el formato, este test falla
 * antes de que lo note un navegador.
 */
class WebPushInteroperabilidadTest {

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder D64 = Base64.getUrlDecoder();
    private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";
    private static final String SUJETO = "mailto:soporte@viasegura.pe";

    private static ECParameterSpec curva() throws Exception {
        AlgorithmParameters p = AlgorithmParameters.getInstance("EC");
        p.init(new ECGenParameterSpec("secp256r1"));
        return p.getParameterSpec(ECParameterSpec.class);
    }

    private static KeyPair parP256() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        return gen.generateKeyPair();
    }

    private static byte[] sinComprimir(ECPublicKey pub) {
        byte[] out = new byte[65];
        out[0] = 0x04;
        copiar32(pub.getW().getAffineX(), out, 1);
        copiar32(pub.getW().getAffineY(), out, 33);
        return out;
    }

    private static byte[] escalar(ECPrivateKey priv) {
        byte[] out = new byte[32];
        copiar32(priv.getS(), out, 0);
        return out;
    }

    private static void copiar32(BigInteger n, byte[] destino, int desde) {
        byte[] b = n.toByteArray();
        int largo = Math.min(b.length, 32);
        System.arraycopy(b, b.length - largo, destino, desde + 32 - largo, largo);
    }

    private static PublicKey desdeSinComprimir(byte[] punto) throws Exception {
        assertThat(punto).hasSize(65);
        assertThat(punto[0]).isEqualTo((byte) 0x04);
        ECPoint w = new ECPoint(new BigInteger(1, Arrays.copyOfRange(punto, 1, 33)),
                new BigInteger(1, Arrays.copyOfRange(punto, 33, 65)));
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, curva()));
    }

    private static byte[] hmac(byte[] clave, byte[]... datos) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(clave, "HmacSHA256"));
        for (byte[] d : datos) {
            mac.update(d);
        }
        return mac.doFinal();
    }

    private static byte[] concat(byte[]... partes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] p : partes) {
            out.writeBytes(p);
        }
        return out.toByteArray();
    }

    /** El cuerpo de un {@link HttpRequest} del JDK, leyendo su BodyPublisher. */
    private static byte[] cuerpo(HttpRequest pedido) throws Exception {
        CompletableFuture<byte[]> listo = new CompletableFuture<>();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        pedido.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<>() {
            @Override
            public void onSubscribe(Flow.Subscription s) {
                s.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer item) {
                byte[] b = new byte[item.remaining()];
                item.get(b);
                out.writeBytes(b);
            }

            @Override
            public void onError(Throwable t) {
                listo.completeExceptionally(t);
            }

            @Override
            public void onComplete() {
                listo.complete(out.toByteArray());
            }
        });
        return listo.get(5, TimeUnit.SECONDS);
    }

    /** RFC 8291 seccion 3.4 + RFC 8188: lo que haria el navegador al recibir el push. */
    private static byte[] descifrarComoNavegador(byte[] cuerpo, KeyPair navegador, byte[] auth) throws Exception {
        ByteBuffer buf = ByteBuffer.wrap(cuerpo);
        byte[] salt = new byte[16];
        buf.get(salt);
        int rs = buf.getInt();
        int idlen = Byte.toUnsignedInt(buf.get());
        assertThat(idlen).as("keyid = clave publica efimera del servidor").isEqualTo(65);
        byte[] asPublic = new byte[idlen];
        buf.get(asPublic);
        byte[] cifrado = new byte[buf.remaining()];
        buf.get(cifrado);
        assertThat(cifrado.length).isLessThanOrEqualTo(rs);

        KeyAgreement ecdh = KeyAgreement.getInstance("ECDH");
        ecdh.init((PrivateKey) navegador.getPrivate());
        ecdh.doPhase(desdeSinComprimir(asPublic), true);
        byte[] ecdhSecret = ecdh.generateSecret();

        byte[] uaPublic = sinComprimir((ECPublicKey) navegador.getPublic());
        byte[] prkKey = hmac(auth, ecdhSecret);
        byte[] keyInfo = concat("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[] {0},
                uaPublic, asPublic);
        byte[] ikm = hmac(prkKey, keyInfo, new byte[] {1});
        byte[] prk = hmac(salt, ikm);
        byte[] cek = Arrays.copyOf(hmac(prk,
                "Content-Encoding: aes128gcm".getBytes(StandardCharsets.US_ASCII), new byte[] {0, 1}), 16);
        byte[] nonce = Arrays.copyOf(hmac(prk,
                "Content-Encoding: nonce".getBytes(StandardCharsets.US_ASCII), new byte[] {0, 1}), 12);

        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] claro = aes.doFinal(cifrado);

        // Registro unico: datos || 0x02 || relleno de ceros.
        int fin = claro.length - 1;
        while (fin >= 0 && claro[fin] == 0) {
            fin--;
        }
        assertThat(claro[fin]).as("delimitador del ultimo registro").isEqualTo((byte) 0x02);
        return Arrays.copyOf(claro, fin);
    }

    @Test
    void elNavegadorDescifraElCuerpo_yLaFirmaVapidVerifica() throws Exception {
        KeyPair vapid = parP256();
        String vapidPublica = B64.encodeToString(sinComprimir((ECPublicKey) vapid.getPublic()));
        ZerodepWebPushAdapter adapter = new ZerodepWebPushAdapter(vapidPublica,
                B64.encodeToString(escalar((ECPrivateKey) vapid.getPrivate())), SUJETO, 1, 1);

        KeyPair navegador = parP256();
        byte[] auth = new byte[16];
        new SecureRandom().nextBytes(auth);
        String texto = "{\"titulo\":\"Ciudad Viva\",\"cuerpo\":\"Su reporte #7 esta en proceso.\","
                + "\"url\":\"/mis-reportes/7\",\"reporteId\":7,\"estado\":\"EN_PROCESO\"}";

        HttpRequest pedido = adapter.prepararPedido(
                new DestinoPush(ENDPOINT, B64.encodeToString(sinComprimir((ECPublicKey) navegador.getPublic())),
                        B64.encodeToString(auth)),
                texto.getBytes(StandardCharsets.UTF_8), "reporte-7");

        // Cabeceras del protocolo (RFC 8030 / 8188).
        assertThat(pedido.method()).isEqualTo("POST");
        assertThat(pedido.uri().toString()).isEqualTo(ENDPOINT);
        assertThat(pedido.headers().firstValue("Content-Encoding")).contains("aes128gcm");
        assertThat(pedido.headers().firstValue("TTL")).contains(String.valueOf(24 * 3600));
        assertThat(pedido.headers().firstValue("Topic")).contains("reporte-7");

        // RFC 8291: el navegador recupera exactamente el texto.
        byte[] claro = descifrarComoNavegador(cuerpo(pedido), navegador, auth);
        assertThat(new String(claro, StandardCharsets.UTF_8)).isEqualTo(texto);

        // RFC 8292: Authorization: vapid t=<JWT>, k=<clave publica>.
        String autorizacion = pedido.headers().firstValue("Authorization").orElseThrow();
        assertThat(autorizacion).startsWith("vapid ");
        Matcher t = Pattern.compile("t=([A-Za-z0-9_\\-.]+)").matcher(autorizacion);
        Matcher k = Pattern.compile("k=([A-Za-z0-9_\\-]+)").matcher(autorizacion);
        assertThat(t.find()).isTrue();
        assertThat(k.find()).isTrue();
        assertThat(k.group(1)).isEqualTo(vapidPublica);

        String[] jwt = t.group(1).split("\\.");
        assertThat(jwt).hasSize(3);
        ObjectMapper json = new ObjectMapper();
        JsonNode cabecera = json.readTree(D64.decode(jwt[0]));
        assertThat(cabecera.get("alg").asText()).isEqualTo("ES256");
        Signature es256 = Signature.getInstance("SHA256withECDSAinP1363Format");
        es256.initVerify(desdeSinComprimir(D64.decode(k.group(1))));
        es256.update((jwt[0] + "." + jwt[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(es256.verify(D64.decode(jwt[2]))).as("firma ES256 del JWT VAPID").isTrue();

        JsonNode claims = json.readTree(D64.decode(jwt[1]));
        assertThat(claims.get("aud").asText()).isEqualTo("https://fcm.googleapis.com");
        assertThat(claims.get("sub").asText()).isEqualTo(SUJETO);
        long exp = claims.get("exp").asLong();
        long ahora = Instant.now().getEpochSecond();
        // RFC 8292: a lo sumo 24 h en el futuro.
        assertThat(exp).isGreaterThan(ahora).isLessThanOrEqualTo(ahora + 24 * 3600);
    }

    @Test
    void otroNavegadorNoPuedeDescifrar() throws Exception {
        KeyPair vapid = parP256();
        ZerodepWebPushAdapter adapter = new ZerodepWebPushAdapter(
                B64.encodeToString(sinComprimir((ECPublicKey) vapid.getPublic())),
                B64.encodeToString(escalar((ECPrivateKey) vapid.getPrivate())), SUJETO, 1, 1);
        KeyPair destinatario = parP256();
        KeyPair intruso = parP256();
        byte[] auth = new byte[16];
        new SecureRandom().nextBytes(auth);

        HttpRequest pedido = adapter.prepararPedido(
                new DestinoPush(ENDPOINT, B64.encodeToString(sinComprimir((ECPublicKey) destinatario.getPublic())),
                        B64.encodeToString(auth)),
                "secreto".getBytes(StandardCharsets.UTF_8), "t");
        byte[] cuerpo = cuerpo(pedido);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> descifrarComoNavegador(cuerpo, intruso, auth))
                .isInstanceOf(javax.crypto.AEADBadTagException.class);
    }
}
