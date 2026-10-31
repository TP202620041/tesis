package pe.edu.upc.viasegura.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Tareas programadas ({@code @Scheduled}), desde BE-15.
 *
 * <p>El patron, para esta y las que vengan (BE-13):</p>
 * <ul>
 *   <li>el {@code @Scheduled} va en un metodo de un {@code service} del modulo
 *       dueño de los datos, con la expresion cron en una propiedad
 *       ({@code app.<tema>.cron}) y {@code zone = "America/Lima"};</li>
 *   <li>el metodo programado no es {@code @Transactional}: abre transacciones
 *       cortas con {@code TransactionOperations}, para que un dato que falla no
 *       revierta los demas;</li>
 *   <li>la tarea es idempotente y segura si corren dos instancias a la vez
 *       (sentencias condicionales y candados de fila): por eso no hay un
 *       candado distribuido (ShedLock). Hoy el backend corre en una sola
 *       instancia en Railway;</li>
 *   <li>los tests la apagan con {@code "-"} ({@code application-test.yml}) y
 *       llaman al metodo directamente: una corrida a mitad de la suite haria
 *       que los IT dependan de la hora.</li>
 * </ul>
 *
 * <p>Usa el {@code ThreadPoolTaskScheduler} que configura Spring Boot (un hilo,
 * {@code spring.task.scheduling}), separado de los executors de
 * {@link AsyncConfig}: una tarea programada larga no quita hilos a los correos
 * ni a los avisos.</p>
 */
@Configuration
@EnableScheduling
public class TareasProgramadasConfig {
}
