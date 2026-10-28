package pe.edu.upc.viasegura.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Los dos executors asincronos (NC-04c). En los IT no existen (perfil
 * {@code test}, ver {@code support/EjecutorSincronoTestConfig}), asi que su
 * tamano y sus reglas se fijan aqui, sin Spring.
 */
class AsyncConfigTest {

    private final AsyncConfig config = new AsyncConfig();

    @Test
    void elDeLasSugerencias_tieneHilosFijos_colaAcotada_yNombreAparte() {
        ThreadPoolTaskExecutor sugerencias = (ThreadPoolTaskExecutor) config.ejecutorSugerencias(2, 100);
        try {
            assertThat(sugerencias.getCorePoolSize()).isEqualTo(2);
            assertThat(sugerencias.getMaxPoolSize()).isEqualTo(2);
            assertThat(sugerencias.getQueueCapacity()).isEqualTo(100);
            assertThat(sugerencias.getThreadNamePrefix()).isEqualTo("viasegura-sugerencia-");
            assertThat(sugerencias.getThreadPoolExecutor().getRejectedExecutionHandler())
                    .isInstanceOf(ThreadPoolExecutor.AbortPolicy.class);
        } finally {
            sugerencias.shutdown();
        }
    }

    @Test
    void elDeLasSugerencias_conLosHilosOcupadosYLaColaLlena_rechaza_noCorreEnElHiloQueEncola() throws Exception {
        // Dos tareas esperando (como dos sugerencias esperando turno) y una en
        // cola: la siguiente se rechaza y el listener registra la perdida.
        ThreadPoolTaskExecutor sugerencias = (ThreadPoolTaskExecutor) config.ejecutorSugerencias(2, 1);
        CountDownLatch soltar = new CountDownLatch(1);
        CountDownLatch dosCorriendo = new CountDownLatch(2);
        Runnable esperando = () -> {
            dosCorriendo.countDown();
            try {
                soltar.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        };
        try {
            sugerencias.execute(esperando);
            sugerencias.execute(esperando);
            assertThat(dosCorriendo.await(5, TimeUnit.SECONDS)).isTrue();
            sugerencias.execute(esperando);

            assertThatThrownBy(() -> sugerencias.execute(esperando)).isInstanceOf(TaskRejectedException.class);
        } finally {
            soltar.countDown();
            sugerencias.shutdown();
        }
    }

    @Test
    void elGeneral_esElPrimario_yElDeLasSugerenciasNo() throws Exception {
        // Con dos executors, el general sigue siendo el de un @Async sin nombre.
        assertThat(AsyncConfig.class.getMethod("ejecutorAsincrono", int.class, int.class, int.class)
                .isAnnotationPresent(Primary.class)).isTrue();
        assertThat(AsyncConfig.class.getMethod("ejecutorSugerencias", int.class, int.class)
                .isAnnotationPresent(Primary.class)).isFalse();
        assertThat(AsyncConfig.class.getMethod("ejecutorSugerencias", int.class, int.class)
                .getAnnotation(Bean.class).name()).containsExactly(AsyncConfig.EJECUTOR_SUGERENCIAS);
    }
}
