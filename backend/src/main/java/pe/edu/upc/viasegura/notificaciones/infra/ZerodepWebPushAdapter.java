package pe.edu.upc.viasegura.notificaciones.infra;

import com.zerodeplibs.webpush.PushSubscription;
import com.zerodeplibs.webpush.VAPIDKeyPair;
import com.zerodeplibs.webpush.VAPIDKeyPairs;
import com.zerodeplibs.webpush.httpclient.StandardHttpClientRequestPreparer;
import com.zerodeplibs.webpush.key.PrivateKeySources;
import com.zerodeplibs.webpush.key.PublicKeySources;
import java.math.BigInteger;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPrivateKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import pe.edu.upc.viasegura.notificaciones.domain.DestinoPush;
import pe.edu.upc.viasegura.notificaciones.domain.ResultadoEnvioPush;
import pe.edu.upc.viasegura.notificaciones.port.EnviadorWebPush;

/**
 * Envio Web Push real con {@code zerodep-web-push-java} (US-21): VAPID
 * (RFC 8292), cifrado {@code aes128gcm} (RFC 8291) y el {@link HttpClient}
 * del JDK.
 *
 * <p><b>Claves VAPID por entorno</b> ({@code VAPID_PUBLIC_KEY},
 * {@code VAPID_PRIVATE_KEY}, {@code VAPID_SUBJECT}), en el formato base64url
 * que genera {@code npx web-push generate-vapid-keys}: la publica es el punto
 * sin comprimir (65 bytes) y la privada el escalar (32 bytes). Nunca van en el
 * repositorio. Si faltan o no son validas, el adaptador queda <b>sin
 * configurar</b>: la app arranca igual, el canal PUSH se reporta no
 * disponible y el aviso cae a correo si hay permiso.</p>
 */
@Slf4j
@Component
public class ZerodepWebPushAdapter implements EnviadorWebPush {

    /** El aviso pierde sentido despues de un dia; el servicio de push lo descarta. */
    static final long TTL_HORAS = 24;

    /** Bytes del cuerpo de un rechazo que se leen para el log; el resto se descarta. */
    static final int MAX_BYTES_CUERPO = 1024;

    /** Caracteres del motivo de un rechazo que llegan al log. */
    public static final int MAX_CARACTERES_MOTIVO = 200;

    private final VAPIDKeyPair claves;
    private final String clavePublica;
    private final String sujeto;
    private final HttpClient httpClient;
    private final Duration timeoutPedido;

    /**
     * Timeouts cortos (3 s de conexion, 5 s de pedido por defecto): el envio
     * corre en el executor asincrono acotado, y un servicio de push lento no
     * debe ocupar sus pocos hilos.
     */
    public ZerodepWebPushAdapter(
            @Value("${app.notificaciones.push.vapid.public-key:}") String clavePublica,
            @Value("${app.notificaciones.push.vapid.private-key:}") String clavePrivada,
            @Value("${app.notificaciones.push.vapid.subject:}") String sujeto,
            @Value("${app.notificaciones.push.timeout-conexion-segundos:3}") long timeoutConexionSegundos,
            @Value("${app.notificaciones.push.timeout-pedido-segundos:5}") long timeoutPedidoSegundos) {
        this.sujeto = sujeto;
        this.timeoutPedido = Duration.ofSeconds(timeoutPedidoSegundos);
        this.claves = cargarClaves(clavePublica, clavePrivada, sujeto);
        this.clavePublica = claves != null ? clavePublica.trim() : null;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(timeoutConexionSegundos))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    /** Las claves, o {@code null} si faltan o son invalidas (nunca impide arrancar). */
    static VAPIDKeyPair cargarClaves(String publica, String privada, String sujeto) {
        if (!StringUtils.hasText(publica) || !StringUtils.hasText(privada) || !StringUtils.hasText(sujeto)) {
            log.warn("Web Push sin configurar (faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT): "
                    + "el canal PUSH queda no disponible");
            return null;
        }
        if (!sujeto.startsWith("mailto:") && !sujeto.startsWith("https://")) {
            log.error("VAPID_SUBJECT debe empezar con mailto: o https://; el canal PUSH queda no disponible");
            return null;
        }
        try {
            Base64.Decoder b64 = Base64.getUrlDecoder();
            return VAPIDKeyPairs.of(
                    PrivateKeySources.ofECPrivateKey(clavePrivadaDesdeEscalar(b64.decode(privada.trim()))),
                    PublicKeySources.ofUncompressedBytes(b64.decode(publica.trim())));
        } catch (RuntimeException | GeneralSecurityException e) {
            // Sin el mensaje: podria contener material de la clave.
            log.error("Claves VAPID invalidas ({}); el canal PUSH queda no disponible", e.getClass().getSimpleName());
            return null;
        }
    }

    /** El escalar de 32 bytes de la curva P-256 como {@link ECPrivateKey}. */
    private static ECPrivateKey clavePrivadaDesdeEscalar(byte[] escalar) throws GeneralSecurityException {
        if (escalar.length != 32) {
            throw new GeneralSecurityException("La clave privada VAPID debe tener 32 bytes");
        }
        AlgorithmParameters parametros = AlgorithmParameters.getInstance("EC");
        parametros.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec curva = parametros.getParameterSpec(ECParameterSpec.class);
        return (ECPrivateKey) KeyFactory.getInstance("EC")
                .generatePrivate(new ECPrivateKeySpec(new BigInteger(1, escalar), curva));
    }

    @Override
    public boolean estaConfigurado() {
        return claves != null;
    }

    @Override
    public Optional<String> clavePublica() {
        return Optional.ofNullable(clavePublica);
    }

    @Override
    public ResultadoEnvioPush enviar(DestinoPush destino, byte[] payload, String topico) {
        if (claves == null) {
            return ResultadoEnvioPush.ERROR;
        }
        try {
            HttpResponse<String> respuesta = httpClient.send(prepararPedido(destino, payload, topico),
                    info -> manejarCuerpo(info.statusCode()));
            int status = respuesta.statusCode();
            ResultadoEnvioPush resultado = clasificar(status);
            if (resultado == ResultadoEnvioPush.ERROR) {
                registrarRechazo(host(destino.endpoint()), status, respuesta.body());
            }
            return resultado;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return ResultadoEnvioPush.ERROR;
        } catch (Exception e) {
            log.warn("Fallo el envio push a {}: {}", host(destino.endpoint()), e.getClass().getSimpleName());
            return ResultadoEnvioPush.ERROR;
        }
    }

    /**
     * El cuerpo solo se lee cuando el envio no se entrego ni caduco, y solo
     * para el log: acotado a {@link #MAX_BYTES_CUERPO} bytes y al timeout del
     * pedido, para que un servicio que no termina de responder no retenga el
     * hilo. En 2xx y 404/410 se descarta sin leerlo.
     */
    private HttpResponse.BodySubscriber<String> manejarCuerpo(int status) {
        if (clasificar(status) != ResultadoEnvioPush.ERROR) {
            return HttpResponse.BodySubscribers.replacing((String) null);
        }
        return new CuerpoAcotado(MAX_BYTES_CUERPO, timeoutPedido);
    }

    /**
     * Diagnostico de un rechazo (US-21): host, estado y el motivo que da el
     * servicio (Apple responde JSON como {@code {"reason":"BadJwtToken"}},
     * FCM y Mozilla texto). Nunca el endpoint completo (es una URL de
     * capacidad), las claves de la suscripcion ni la cabecera
     * {@code Authorization}.
     */
    private static void registrarRechazo(String host, int status, String cuerpo) {
        String motivo = motivoParaLog(cuerpo);
        if (status == 401 || status == 403) {
            log.warn("El servicio de push {} rechazo la firma VAPID (HTTP {}, motivo: {}): si se rotaron las claves, "
                    + "esa suscripcion falla hasta que el navegador se vuelva a suscribir", host, status, motivo);
        } else {
            log.warn("El servicio de push {} rechazo el envio (HTTP {}, motivo: {})", host, status, motivo);
        }
    }

    /**
     * El cuerpo de la respuesta apto para una linea de log: sin saltos de
     * linea ni caracteres de control (contra la inyeccion en el log), con los
     * espacios colapsados y como mucho {@link #MAX_CARACTERES_MOTIVO}
     * caracteres.
     */
    public static String motivoParaLog(String cuerpo) {
        if (cuerpo == null || cuerpo.isBlank()) {
            return "(sin cuerpo)";
        }
        StringBuilder limpio = new StringBuilder(MAX_CARACTERES_MOTIVO);
        boolean espacioPendiente = false;
        int i = 0;
        for (; i < cuerpo.length() && limpio.length() < MAX_CARACTERES_MOTIVO; i++) {
            char c = cuerpo.charAt(i);
            if (esSeparadorOControl(c)) {
                espacioPendiente = limpio.length() > 0;
            } else {
                if (espacioPendiente) {
                    limpio.append(' ');
                    espacioPendiente = false;
                }
                limpio.append(c);
            }
        }
        boolean truncado = cuerpo.substring(i).chars().anyMatch(c -> !esSeparadorOControl((char) c));
        return truncado ? limpio + "..." : limpio.toString();
    }

    private static boolean esSeparadorOControl(char c) {
        int tipo = Character.getType(c);
        return Character.isWhitespace(c) || Character.isISOControl(c) || Character.isSpaceChar(c)
                || tipo == Character.FORMAT || tipo == Character.LINE_SEPARATOR
                || tipo == Character.PARAGRAPH_SEPARATOR || tipo == Character.SURROGATE;
    }

    /**
     * Arma el pedido firmado (VAPID) y cifrado ({@code aes128gcm}) sin
     * enviarlo. Publico para el test de interoperabilidad criptografica, que
     * lo descifra y verifica la firma solo con el JDK.
     */
    public HttpRequest prepararPedido(DestinoPush destino, byte[] payload, String topico) {
        if (claves == null) {
            throw new IllegalStateException("Web Push sin configurar");
        }
        PushSubscription suscripcion = new PushSubscription();
        suscripcion.setEndpoint(destino.endpoint());
        PushSubscription.Keys llaves = new PushSubscription.Keys();
        llaves.setP256dh(destino.p256dh());
        llaves.setAuth(destino.auth());
        suscripcion.setKeys(llaves);

        return StandardHttpClientRequestPreparer.getBuilder()
                .pushSubscription(suscripcion)
                .vapidJWTExpiresAfter(12, TimeUnit.HOURS)
                .vapidJWTSubject(sujeto)
                .pushMessage(payload)
                .ttl(TTL_HORAS, TimeUnit.HOURS)
                .urgencyNormal()
                .topic(topico)
                .build(claves)
                .toRequestBuilder()
                .timeout(timeoutPedido)
                .build();
    }

    /**
     * 2xx entregado; 404/410 suscripcion caducada; el resto, error.
     *
     * <p>401/403 (firma VAPID rechazada, p. ej. tras rotar las claves) se trata
     * como ERROR y <b>no</b> desactiva la suscripcion: desde aqui no se
     * distingue una suscripcion creada con la clave anterior de un error de
     * configuracion del servidor (sujeto, reloj, claves mal copiadas), y en
     * ese caso desactivaria las de todos los usuarios de una vez. El
     * frontend se vuelve a suscribir al iniciar sesion si la clave publica
     * cambio.</p>
     */
    public static ResultadoEnvioPush clasificar(int status) {
        if (status >= 200 && status < 300) {
            return ResultadoEnvioPush.ENTREGADO;
        }
        if (status == 404 || status == 410) {
            return ResultadoEnvioPush.SUSCRIPCION_CADUCADA;
        }
        return ResultadoEnvioPush.ERROR;
    }

    /** Solo el host para el log: el endpoint completo es una URL de capacidad. */
    private static String host(String endpoint) {
        try {
            return java.net.URI.create(endpoint).getHost();
        } catch (RuntimeException e) {
            return "?";
        }
    }
}
