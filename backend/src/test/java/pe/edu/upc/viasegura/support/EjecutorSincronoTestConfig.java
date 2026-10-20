package pe.edu.upc.viasegura.support;

import java.util.concurrent.atomic.AtomicReference;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import pe.edu.upc.viasegura.common.config.AsyncConfig;

/**
 * Trabajo asincrono en los IT.
 *
 * <p><b>Executor:</b> el de {@link AsyncConfig#EJECUTOR} corre cada tarea en
 * un hilo nuevo y <b>espera a que termine</b>. Al volver el {@code PATCH},
 * las notificaciones ya estan registradas y los tests afirman sin esperas ni
 * {@code Thread.sleep}. No es un {@code SyncTaskExecutor} (mismo hilo) a
 * proposito: en {@code AFTER_COMMIT} el hilo que hizo el commit todavia tiene
 * ligados los recursos de esa transaccion, y una escritura ahi "participaria"
 * en ella sin confirmarse (lo advierte la documentacion de
 * {@code TransactionalEventListener}). En produccion la tarea corre en un hilo
 * del pool, sin esa transaccion; este executor reproduce eso. El bean real
 * lleva {@code @Profile("!test")}, asi que no hay dos con el mismo nombre.</p>
 *
 * <p><b>Errores:</b> como {@link AsyncConfigurer}, guarda la excepcion que
 * escape de un metodo {@code @Async}, y {@code AbstractPostgisIT} la relanza
 * en su {@code @AfterEach}. Asi un fallo en el hilo asincrono hace fallar el
 * test con su causa, en vez de quedar solo en el log.</p>
 */
@TestConfiguration
public class EjecutorSincronoTestConfig implements AsyncConfigurer {

    private final AtomicReference<Throwable> errorAsincrono = new AtomicReference<>();

    @Bean(name = AsyncConfig.EJECUTOR)
    public TaskExecutor ejecutorAsincrono() {
        return tarea -> {
            Thread hilo = new Thread(tarea, "viasegura-async-test");
            hilo.start();
            try {
                hilo.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Interrumpido esperando la tarea asincrona", e);
            }
        };
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (error, metodo, argumentos) -> errorAsincrono.compareAndSet(null,
                new AssertionError("Fallo en el metodo asincrono " + metodo.getName(), error));
    }

    /** Limpia el error de un test anterior. */
    public void reiniciar() {
        errorAsincrono.set(null);
    }

    /** Relanza el primer error asincrono del test, si lo hubo. */
    public void relanzarSiHuboError() {
        Throwable error = errorAsincrono.getAndSet(null);
        if (error instanceof AssertionError ae) {
            throw ae;
        }
    }
}
