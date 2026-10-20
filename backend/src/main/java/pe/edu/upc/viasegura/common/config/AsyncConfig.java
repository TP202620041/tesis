package pe.edu.upc.viasegura.common.config;

import java.util.concurrent.ThreadPoolExecutor;
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
 *   <li>con la cola llena la tarea se <b>rechaza</b>
 *       ({@code TaskRejectedException}, politica {@code AbortPolicy}) y quien
 *       la encolo registra que se pierde (p. ej.
 *       {@code ReporteEstadoCambiadoListener}, con el reporte y el usuario).
 *       Nunca corre en el hilo que la pidio (eso devolveria la latencia de la
 *       red al funcionario que cambio el estado). Perder un aviso con el
 *       sistema saturado se acepta: el reporte y su historial no dependen de
 *       el;</li>
 *   <li>al apagar, espera hasta 10 s a que terminen las tareas en curso.</li>
 * </ul>
 *
 * <p><b>Reemplaza al {@code applicationTaskExecutor} de Spring Boot</b>: Boot
 * solo crea el suyo si no hay ningun {@code Executor}, asi que este pasa a
 * ser el unico, y por tanto tambien el executor por defecto de cualquier
 * {@code @Async} sin nombre (y de lo que Boot le asigne, como el MVC
 * asincrono). Conviene nombrarlo igual en cada {@code @Async} para dejarlo
 * explicito.</p>
 *
 * <p>En el perfil {@code test} este bean no existe: los IT registran uno con
 * el mismo nombre ({@code support/EjecutorSincronoTestConfig}) que corre la
 * tarea en otro hilo y la espera, para seguir siendo deterministas.</p>
 */
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
        ejecutor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        ejecutor.setWaitForTasksToCompleteOnShutdown(true);
        ejecutor.setAwaitTerminationSeconds(10);
        ejecutor.initialize();
        return ejecutor;
    }
}
