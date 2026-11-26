package pe.edu.upc.viasegura.notificaciones.infra;

import java.io.ByteArrayOutputStream;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;

/**
 * Lee como texto UTF-8 los primeros {@code maxBytes} del cuerpo de una
 * respuesta y descarta el resto (US-21, diagnostico del push). Nunca falla:
 * si la conexion se corta, o el cuerpo no termina de llegar en
 * {@code espera}, entrega lo que alcanzo a leer. Asi leer el motivo de un
 * rechazo no puede retener el hilo ni la memoria mas de lo acotado.
 */
final class CuerpoAcotado implements HttpResponse.BodySubscriber<String> {

    private final int maxBytes;
    private final ByteArrayOutputStream leido;
    private final CompletableFuture<String> cuerpo = new CompletableFuture<>();
    private volatile Flow.Subscription suscripcion;

    CuerpoAcotado(int maxBytes, Duration espera) {
        this.maxBytes = maxBytes;
        this.leido = new ByteArrayOutputStream(Math.min(maxBytes, 256));
        CompletableFuture.delayedExecutor(espera.toMillis(), TimeUnit.MILLISECONDS).execute(this::cortar);
    }

    @Override
    public CompletionStage<String> getBody() {
        return cuerpo;
    }

    @Override
    public void onSubscribe(Flow.Subscription subscription) {
        this.suscripcion = subscription;
        if (cuerpo.isDone()) {
            subscription.cancel();
        } else {
            subscription.request(1);
        }
    }

    @Override
    public void onNext(List<ByteBuffer> fragmentos) {
        synchronized (leido) {
            for (ByteBuffer fragmento : fragmentos) {
                int cabe = Math.min(maxBytes - leido.size(), fragmento.remaining());
                if (cabe > 0) {
                    byte[] bytes = new byte[cabe];
                    fragmento.get(bytes);
                    leido.write(bytes, 0, cabe);
                }
            }
            if (leido.size() >= maxBytes) {
                cortar();
                return;
            }
        }
        suscripcion.request(1);
    }

    @Override
    public void onError(Throwable error) {
        completar();
    }

    @Override
    public void onComplete() {
        completar();
    }

    /** Deja de leer y entrega lo leido hasta ahora. */
    private void cortar() {
        Flow.Subscription actual = suscripcion;
        if (actual != null && !cuerpo.isDone()) {
            actual.cancel();
        }
        completar();
    }

    private void completar() {
        synchronized (leido) {
            // new String reemplaza la secuencia UTF-8 que el corte dejo a medias.
            cuerpo.complete(new String(leido.toByteArray(), StandardCharsets.UTF_8));
        }
    }
}
