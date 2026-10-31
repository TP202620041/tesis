package pe.edu.upc.viasegura.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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
    void elDeLasSugerencias_alApagar_esperaALaQueCorre_yLasDeLaColaNoEmpiezanSinInterrupcion() throws Exception {
        // Es lo que hace Spring al cerrar el contexto: primero la parada
        // coordinada (stop), despues la destruccion (shutdown).
        ThreadPoolTaskExecutor sugerencias = (ThreadPoolTaskExecutor) config.ejecutorSugerencias(1, 10);
        CountDownLatch corriendo = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        AtomicBoolean laQueCorriaTermino = new AtomicBoolean();
        AtomicBoolean encoladaSinInterrupcion = new AtomicBoolean();
        try {
            sugerencias.execute(() -> {
                corriendo.countDown();
                try {
                    // Como una sugerencia oficial esperando turno.
                    laQueCorriaTermino.set(soltar.await(10, TimeUnit.SECONDS));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
            assertThat(corriendo.await(5, TimeUnit.SECONDS)).isTrue();
            sugerencias.execute(() -> encoladaSinInterrupcion.set(!Thread.currentThread().isInterrupted()));

            CountDownLatch parado = new CountDownLatch(1);
            sugerencias.stop(parado::countDown);
            assertThat(parado.await(300, TimeUnit.MILLISECONDS)).as("espera a la que corre").isFalse();
            soltar.countDown();
            assertThat(parado.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(laQueCorriaTermino).as("la que corria termino, sin interrupcion").isTrue();
        } finally {
            soltar.countDown();
            sugerencias.shutdown();
        }
        // La encolada no corrio, o corrio con el hilo interrumpido (y
        // SugerenciaCategoriaService no hace nada en ese caso).
        assertThat(sugerencias.getThreadPoolExecutor().awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        assertThat(encoladaSinInterrupcion).isFalse();
    }

    @Test
    void elDelIndice_tieneUnHilo_colaDeUna_yNoEsperaLaColaAlApagar() throws Exception {
        // BE-12: un solo REFRESH a la vez y, con el coalescido, a lo sumo una
        // tarea pendiente.
        ThreadPoolTaskExecutor indice = (ThreadPoolTaskExecutor) config.ejecutorIndice();
        try {
            assertThat(indice.getCorePoolSize()).isEqualTo(1);
            assertThat(indice.getMaxPoolSize()).isEqualTo(1);
            assertThat(indice.getQueueCapacity()).isEqualTo(1);
            assertThat(indice.getThreadNamePrefix()).isEqualTo("viasegura-indice-");
            assertThat(indice.getThreadPoolExecutor().getRejectedExecutionHandler())
                    .isInstanceOf(ThreadPoolExecutor.AbortPolicy.class);
            assertThat(AsyncConfig.class.getMethod("ejecutorIndice").isAnnotationPresent(Primary.class)).isFalse();
            assertThat(AsyncConfig.class.getMethod("ejecutorIndice").getAnnotation(Bean.class).name())
                    .containsExactly(AsyncConfig.EJECUTOR_INDICE);
        } finally {
            indice.shutdown();
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
