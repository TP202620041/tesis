package pe.edu.upc.viasegura.support;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import pe.edu.upc.viasegura.notificaciones.domain.DestinoPush;
import pe.edu.upc.viasegura.notificaciones.domain.ResultadoEnvioPush;
import pe.edu.upc.viasegura.notificaciones.port.EnviadorWebPush;

/**
 * Reemplazo del puerto {@link EnviadorWebPush} en todos los IT (US-21):
 * registra lo que se habria enviado y responde lo que el test le indique.
 * Ningun IT llama a un servicio de push real.
 */
public class EnviadorWebPushFake implements EnviadorWebPush {

    public static final String CLAVE_PUBLICA =
            "BOrZyYb2AXPjeMyBNNAx4QF1RgyYZ47_b5qcaXr1A9Wb3bzcHeunKF-5qMR69gNj7XrJLvPh9NTV8mQ1dvwEGkQ";

    /** Un envio que se habria entregado al servicio de push. */
    public record Envio(DestinoPush destino, String payload, String topico) {}

    private final List<Envio> enviados = new CopyOnWriteArrayList<>();
    private final Map<String, ResultadoEnvioPush> respuestas = new ConcurrentHashMap<>();
    private volatile boolean configurado = true;

    /** Estado inicial de cada test: configurado, todo se entrega, sin envios. */
    public void reiniciar() {
        enviados.clear();
        respuestas.clear();
        configurado = true;
    }

    public void setConfigurado(boolean configurado) {
        this.configurado = configurado;
    }

    /** Lo que respondera el servicio de push para ese endpoint (por defecto, ENTREGADO). */
    public void responder(String endpoint, ResultadoEnvioPush resultado) {
        respuestas.put(endpoint, resultado);
    }

    public List<Envio> enviados() {
        return List.copyOf(enviados);
    }

    @Override
    public boolean estaConfigurado() {
        return configurado;
    }

    @Override
    public Optional<String> clavePublica() {
        return configurado ? Optional.of(CLAVE_PUBLICA) : Optional.empty();
    }

    @Override
    public ResultadoEnvioPush enviar(DestinoPush destino, byte[] payload, String topico) {
        if (!configurado) {
            throw new AssertionError("Se intento un push sin claves VAPID");
        }
        enviados.add(new Envio(destino, new String(payload, StandardCharsets.UTF_8), topico));
        return respuestas.getOrDefault(destino.endpoint(), ResultadoEnvioPush.ENTREGADO);
    }

    /** Registra el fake como implementacion principal del puerto. */
    @TestConfiguration
    public static class Config {
        @Bean
        @Primary
        public EnviadorWebPushFake enviadorWebPushFake() {
            return new EnviadorWebPushFake();
        }
    }
}
