package pe.edu.upc.viasegura.common.config;

import java.util.concurrent.ThreadPoolExecutor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Trabajo asincrono posterior al commit: avisos al ciudadano (US-16/US-21)
 * y, cuando exista, la sugerencia de categoria (D-08, ARCHITECTURE.md 4.3).
 *
 * <p>Un solo executor <b>acotado y con nombre</b> ({@value #EJECUTOR}),
 * reutilizable con {@code @Async(AsyncConfig.EJECUTOR)}:</p>
 * <ul>
 *   <li>hilos {@code app.async.hilos-base} a {@code app.async.hilos-max}
 *       (2 a 4) y cola de {@code app.async.cola} (100) tareas;</li>
 *   <li>con la cola llena la tarea se <b>descarta y se registra</b>; nunca
 *       corre en el hilo que la pidio (eso devolveria la latencia de la red
 *       al funcionario que cambio el estado). Perder un aviso con el sistema
 *       saturado se acepta: el reporte y su historial no dependen de el;</li>
 *   <li>al apagar, espera hasta 10 s a que terminen las tareas en curso.</li>
 * </ul>
 *
 * <p>En el perfil {@code test} este bean no existe: los IT registran uno con
 * el mismo nombre ({@code support/EjecutorSincronoTestConfig}) que corre la
 * tarea en otro hilo y la espera, para seguir siendo deterministas.</p>
 */
@Slf4j
@Configuration
@EnableAsync
public class AsyncConfig {

    public static final String EJECUTOR = "ejecutorAsincrono";

    @Bean(name = EJECUTOR)
    @Profile("!test")
    public TaskExecutor ejecutorAsincrono(
            @Value("${app.async.hilos-base:2}") int hilosBase,
            @Value("${app.async.hilos-max:4}") int hilosMax,
            @Value("${app.async.cola:100}") int cola) {
        ThreadPoolTaskExecutor ejecutor = new ThreadPoolTaskExecutor();
        ejecutor.setThreadNamePrefix("viasegura-async-");
        ejecutor.setCorePoolSize(hilosBase);
        ejecutor.setMaxPoolSize(hilosMax);
        ejecutor.setQueueCapacity(cola);
        ejecutor.setRejectedExecutionHandler(descartarYRegistrar());
        ejecutor.setWaitForTasksToCompleteOnShutdown(true);
        ejecutor.setAwaitTerminationSeconds(10);
        ejecutor.initialize();
        return ejecutor;
    }

    private static ThreadPoolExecutor.DiscardPolicy descartarYRegistrar() {
        return new ThreadPoolExecutor.DiscardPolicy() {
            @Override
            public void rejectedExecution(Runnable tarea, ThreadPoolExecutor ejecutor) {
                log.warn("Cola asincrona llena ({} en cola, {} hilos activos): se descarta una tarea",
                        ejecutor.getQueue().size(), ejecutor.getActiveCount());
            }
        };
    }
}
