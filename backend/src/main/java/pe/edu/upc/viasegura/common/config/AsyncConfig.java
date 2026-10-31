package pe.edu.upc.viasegura.common.config;

import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Trabajo asincrono posterior al commit: avisos al ciudadano (US-16/US-21),
 * correos y la sugerencia de categoria (D-08, ARCHITECTURE.md 4.3).
 *
 * <p>El executor general es <b>acotado y con nombre</b> ({@value #EJECUTOR}),
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
 * <p><b>La sugerencia oficial tiene el suyo</b> ({@value #EJECUTOR_SUGERENCIAS},
 * NC-04c): {@code app.async.sugerencias.hilos} hilos fijos (2) y cola de
 * {@code app.async.sugerencias.cola} (100), con el mismo rechazo y otro
 * apagado (ver {@link #ejecutorSugerencias}). Desde NC-04c esa tarea espera hasta 10 s un turno del servicio
 * de inferencia, y mientras espera ocupa su hilo: en el executor general,
 * dos sugerencias esperando dejarian sin hilos a los correos de confirmacion
 * y de recuperacion y a los avisos. Separadas, esperar solo retrasa otras
 * sugerencias. Con 2 hilos, a lo sumo 2 sugerencias oficiales llaman a la vez
 * al servicio, asi que de sus 4 turnos quedan 2 para las vistas previas (ver
 * {@code InferenciaHttpAdapter}).</p>
 *
 * <p><b>El refresco del indice de desempeno tiene el suyo</b>
 * ({@value #EJECUTOR_INDICE}, BE-12): un hilo y cola de una tarea. El
 * listener coalesce los eventos (a lo sumo una tarea pendiente a la vez), asi
 * que no hace falta mas, y con un solo hilo nunca corren dos
 * {@code REFRESH MATERIALIZED VIEW CONCURRENTLY} a la vez: el segundo
 * esperaria el candado del primero con su propia conexion tomada. Va aparte
 * del general para que un refresco largo no retrase correos ni avisos, y
 * aparte del de las sugerencias porque ahi esperaria detras de tareas que
 * aguardan hasta 10 s un turno de inferencia (ver
 * {@code IndiceDesempenoRefreshListener}).</p>
 *
 * <p><b>Reemplazan al {@code applicationTaskExecutor} de Spring Boot</b>:
 * Boot solo crea el suyo si no hay ningun {@code Executor}. El general es
 * {@code @Primary}, asi que sigue siendo el executor por defecto de cualquier
 * {@code @Async} sin nombre. Conviene nombrar el executor en cada
 * {@code @Async} para dejarlo explicito.</p>
 *
 * <p>En el perfil {@code test} estos beans no existen: los IT registran tres
 * con los mismos nombres ({@code support/EjecutorSincronoTestConfig}) que
 * corren la tarea en otro hilo y la esperan, para seguir siendo
 * deterministas.</p>
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    public static final String EJECUTOR = "ejecutorAsincrono";
    /** NC-04c: el de la sugerencia oficial de categoria, que puede esperar un turno de inferencia. */
    public static final String EJECUTOR_SUGERENCIAS = "ejecutorSugerencias";
    /** BE-12: el del refresco coalescido del indice de desempeno. */
    public static final String EJECUTOR_INDICE = "ejecutorIndice";

    /**
     * {@code @Primary}: con dos executors, sigue siendo el de cualquier
     * {@code @Async} sin nombre y el que recibe quien pida un
     * {@code TaskExecutor} sin calificarlo.
     */
    @Bean(name = EJECUTOR)
    @Primary
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

    /**
     * NC-04c: hilos fijos (base = maximo), porque un pool que solo crece con
     * la cola llena se quedaria en los base de todos modos. Las tareas
     * encoladas son solo el id del reporte (la foto se descarga al correr), asi
     * que la cola de 100 no pesa en memoria; en el peor caso, con todas
     * esperando turno, se vacia en unos 100 / 2 x 13 s = 11 minutos, y una
     * sugerencia tardia sigue sirviendo (es interna).
     *
     * <p><b>Apagado distinto del general</b> ({@code waitForTasksToCompleteOnShutdown}
     * en {@code false}, el valor por defecto de Spring): al cerrar el
     * contexto, la parada coordinada pausa el executor y espera a que
     * terminen las sugerencias en curso (a lo sumo 10 s de espera mas 3 s de
     * llamada, dentro de los 30 s por fase de Spring), antes de que se cierre
     * el pool de conexiones. Las que siguen en cola no empiezan y se pierden,
     * como cualquier sugerencia rechazada. Si al destruir el executor queda
     * alguna corriendo, se interrumpe y se rinde. Con {@code true} correria la
     * cola entera durante el apagado, y lo que pasara del plazo escribiria con
     * el pool ya cerrado.</p>
     */
    @Bean(name = EJECUTOR_SUGERENCIAS)
    @Profile("!test")
    public TaskExecutor ejecutorSugerencias(
            @Value("${app.async.sugerencias.hilos:2}") int hilos,
            @Value("${app.async.sugerencias.cola:100}") int cola) {
        ThreadPoolTaskExecutor ejecutor = new ThreadPoolTaskExecutor();
        ejecutor.setThreadNamePrefix("viasegura-sugerencia-");
        ejecutor.setCorePoolSize(hilos);
        ejecutor.setMaxPoolSize(hilos);
        ejecutor.setQueueCapacity(cola);
        ejecutor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        ejecutor.setWaitForTasksToCompleteOnShutdown(false);
        ejecutor.setAwaitTerminationSeconds(5);
        ejecutor.initialize();
        return ejecutor;
    }

    /**
     * BE-12: un hilo fijo y cola de una tarea. {@code IndiceDesempenoRefreshListener}
     * encola a lo sumo una tarea a la vez (la que refresca mientras el indice
     * siga marcado como sucio), y esa tarea, al terminar, puede encolar la
     * siguiente antes de soltar su hilo: por eso la cola es de una y no de
     * cero. Si aun asi se rechaza, la marca queda puesta y el siguiente
     * evento la recoge.
     *
     * <p><b>Apagado como el de las sugerencias</b>
     * ({@code waitForTasksToCompleteOnShutdown} en {@code false}): la parada
     * coordinada espera al refresco que corre, antes de que se cierre el pool
     * de conexiones, y descarta el encolado. Lo que se pierde ahi lo recupera
     * el refresco con que arranca la aplicacion.</p>
     */
    @Bean(name = EJECUTOR_INDICE)
    @Profile("!test")
    public TaskExecutor ejecutorIndice() {
        ThreadPoolTaskExecutor ejecutor = new ThreadPoolTaskExecutor();
        ejecutor.setThreadNamePrefix("viasegura-indice-");
        ejecutor.setCorePoolSize(1);
        ejecutor.setMaxPoolSize(1);
        ejecutor.setQueueCapacity(1);
        ejecutor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        ejecutor.setWaitForTasksToCompleteOnShutdown(false);
        ejecutor.setAwaitTerminationSeconds(5);
        ejecutor.initialize();
        return ejecutor;
    }
}
