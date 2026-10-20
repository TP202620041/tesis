package pe.edu.upc.viasegura.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.task.TaskExecutor;
import pe.edu.upc.viasegura.common.config.AsyncConfig;

/**
 * En los IT el executor asincrono ({@link AsyncConfig#EJECUTOR}) corre cada
 * tarea en un hilo nuevo y <b>espera a que termine</b>: al volver el
 * {@code PATCH}, las notificaciones ya estan registradas y los tests afirman
 * sin esperas ni {@code Thread.sleep}.
 *
 * <p>No es un {@code SyncTaskExecutor} (mismo hilo) a proposito: en
 * {@code AFTER_COMMIT} el hilo que hizo el commit todavia tiene ligados los
 * recursos de esa transaccion, y una escritura ahi "participaria" en ella sin
 * confirmarse (lo advierte la documentacion de
 * {@code TransactionalEventListener}). En produccion la tarea corre en un hilo
 * del pool, sin esa transaccion; este executor reproduce eso.</p>
 *
 * <p>El bean real lleva {@code @Profile("!test")}, asi que no hay dos con el
 * mismo nombre.</p>
 */
@TestConfiguration
public class EjecutorSincronoTestConfig {

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
}
