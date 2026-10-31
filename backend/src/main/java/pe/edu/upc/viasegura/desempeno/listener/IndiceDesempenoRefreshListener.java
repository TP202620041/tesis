package pe.edu.upc.viasegura.desempeno.listener;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.desempeno.service.DesempenoService;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.event.CalificacionRegistradaEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteCategoriaCambiadaEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteCreadoEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteEstadoCambiadoEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteVisibilidadCambiadaEvent;

/**
 * Mantiene el indice de desempeno (US-18/US-20) al dia en "tiempo real",
 * recalculando la vista materializada ante los eventos que cambian sus
 * metricas.
 *
 * <p><b>CORRECCION (2026-08-30).</b> La justificacion original decia que solo
 * habia "dos eventos que mueven metricas" (resolucion y calificacion). Era
 * incompleta, y el hueco era visible en produccion: <b>crear un reporte
 * incrementa {@code total_reportes}</b>, que es el DENOMINADOR de la tasa de
 * resolucion, y no disparaba nada. Un distrito que recibia reportes nuevos
 * sin resolver seguia publicando su tasa anterior —mejor que la real— hasta
 * que ocurriera algo no relacionado. Al revisarlo aparecieron dos casos mas
 * del mismo tipo. Los eventos que mueven el indice son <b>cuatro</b>:</p>
 *
 * <ol>
 *   <li><b>Crear un reporte</b> (US-05): +1 en {@code total_reportes}.</li>
 *   <li><b>Resolver un reporte</b> (US-14): +1 en {@code total_resueltos} y
 *       cambia el tiempo promedio de atencion.</li>
 *   <li><b>Cancelar un reporte</b> (US-08): −1 en {@code total_reportes}, ya
 *       que la vista excluye los CANCELADO (migracion V7).</li>
 *   <li><b>Calificar la atencion</b> (US-26): cambia la satisfaccion
 *       promedio.</li>
 * </ol>
 *
 * <p><b>NC-11a (D-15):</b> ocultar o restablecer un reporte entero (solo el
 * ADMIN) lo saca o lo devuelve al indice, porque la vista excluye los ocultos
 * desde V21. Ocultar solo la foto no mueve nada y no publica el evento.</p>
 *
 * <p>Un quinto caso mueve solo el desglose de US-20, no el agregado:
 * <b>cambiar la categoria</b> de un reporte (US-08) lo traslada entre filas
 * {@code (distrito, categoria)}.</p>
 *
 * <p>NO disparan refresh, a proposito: adherirse a un reporte existente
 * (US-09, no crea fila nueva) y los estados RECIBIDO / EN_PROCESO /
 * RECHAZADO, que no alteran ni el total ni los resueltos.</p>
 *
 * <p>Se dispara {@code AFTER_COMMIT}: el refresh solo corre si el cambio se
 * confirmo, nunca sobre una transaccion que despues hizo rollback. Como
 * {@code REFRESH} recalcula la vista completa, cualquiera de estos eventos
 * deja todo el indice al dia.</p>
 *
 * <p><b>BE-12: asincrono y coalescido.</b> Antes el refresh corria en el hilo
 * de la peticion, con la conexion de la transaccion original todavia tomada:
 * cada creacion usaba dos conexiones a la vez, y 16 creaciones con foto en el
 * mismo segundo agotaban el pool de 10 (prueba de DEP-12, README). Ahora cada
 * evento solo <b>marca el indice como sucio</b> y, si no hay una tarea
 * pendiente, encola una en el executor propio del indice
 * ({@link AsyncConfig#EJECUTOR_INDICE}, un hilo). La tarea repite
 * {@code while (sucio.getAndSet(false)) refrescar()}:</p>
 * <ul>
 *   <li><b>coalesce:</b> los eventos que llegan mientras un refresh corre
 *       producen <b>uno</b> mas, no uno cada uno. Hay a lo sumo un refresh
 *       en curso y uno pendiente;</li>
 *   <li><b>siempre hay un refresco final:</b> la marca se baja antes de
 *       refrescar, asi que un evento que llega durante el refresh la vuelve a
 *       subir y la vuelta siguiente lo recoge. Si llega justo despues de la
 *       ultima vuelta, la tarea lo ve al salir y se encola de nuevo;</li>
 *   <li><b>si el executor rechaza la tarea</b>, la marca queda puesta y el
 *       siguiente evento la recoge;</li>
 *   <li><b>si el refresh falla</b> (cualquier {@code Throwable}), la marca se
 *       vuelve a subir. Si mientras fallaba llegaron eventos, se intenta una
 *       vez mas por ellos: es un intento por tanda de eventos, como antes de
 *       BE-12 era uno por evento. Si no llego ninguno, <b>no se reintenta en
 *       diferido</b>: con la base caida un reintento propio seria un bucle,
 *       y el indice queda desactualizado hasta el proximo evento o el
 *       proximo arranque. Un {@code Error} se relanza despues de subir la
 *       marca;</li>
 *   <li>al arrancar la aplicacion se refresca una vez, por si el apagado
 *       descarto una tarea pendiente o el ultimo refresh fallo;</li>
 *   <li>la peticion vuelve sin esperar al refresh, y el indice publico tarda
 *       lo que dura un refresh (o dos) en reflejar el cambio: aceptable para
 *       una metrica agregada (propuesta del 22/10, opcion A).</li>
 * </ul>
 * <p>No hay una ventana minima entre refrescos: coalescer lo que llega
 * durante un refresh ya acota el trabajo a un refresh en curso y uno
 * pendiente, sin retrasar el primero.</p>
 */
@Slf4j
@Component
public class IndiceDesempenoRefreshListener {

    private final DesempenoService desempenoService;
    private final TaskExecutor ejecutor;

    /** Hay cambios confirmados que la vista todavia no refleja. */
    private final AtomicBoolean sucio = new AtomicBoolean();
    /**
     * Hay una tarea de refresco encolada o corriendo. Por un momento puede
     * haber dos: la que termina (ya bajo esta marca, pero todavia ocupa el
     * hilo) y la que un evento o su propia relectura acaba de encolar. Nunca
     * mas: por eso la cola del executor es de una ({@code AsyncConfig}).
     */
    private final AtomicBoolean programada = new AtomicBoolean();
    /** Cuantas veces se pidio un refresh; distingue si llegaron eventos durante un intento fallido. */
    private final AtomicLong solicitudes = new AtomicLong();

    /**
     * Gancho de prueba, sin efecto en produccion: corre al salir del bucle,
     * antes de bajar {@link #programada}, que es la ventana en la que un
     * evento no puede encolar y solo lo recoge la relectura final.
     */
    volatile Runnable alSalirDelBucle = () -> { };

    public IndiceDesempenoRefreshListener(DesempenoService desempenoService,
                                          @Qualifier(AsyncConfig.EJECUTOR_INDICE) TaskExecutor ejecutor) {
        this.desempenoService = desempenoService;
        this.ejecutor = ejecutor;
    }

    /** Un reporte nuevo suma al denominador de la tasa de resolucion. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCrearReporte(ReporteCreadoEvent evento) {
        solicitarRefresco();
    }

    /**
     * RESUELTO cambia tasa y tiempo promedio; CANCELADO saca el reporte del
     * conteo (la vista excluye ese estado). El resto de estados no mueve
     * ninguna metrica.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCambiarEstado(ReporteEstadoCambiadoEvent evento) {
        if (evento.nuevo() == EstadoReporte.RESUELTO
                || evento.nuevo() == EstadoReporte.CANCELADO) {
            solicitarRefresco();
        }
    }

    /** Mover un reporte de categoria altera el desglose de US-20. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCambiarCategoria(ReporteCategoriaCambiadaEvent evento) {
        solicitarRefresco();
    }

    /** Una nueva calificacion cambia la satisfaccion promedio. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCalificar(CalificacionRegistradaEvent evento) {
        solicitarRefresco();
    }

    /**
     * NC-11a: un reporte oculto por el ADMIN no cuenta en el indice (V21);
     * ocultarlo o restablecerlo mueve el total, los resueltos y la
     * satisfaccion de su distrito y de su categoria.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCambiarVisibilidad(ReporteVisibilidadCambiadaEvent evento) {
        solicitarRefresco();
    }

    /**
     * BE-12: un refresh al arrancar. Recoge el que haya quedado pendiente
     * antes del ultimo apagado (el executor descarta su cola al cerrar) o
     * tras un fallo sin eventos posteriores.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void alArrancar() {
        solicitarRefresco();
    }

    private void solicitarRefresco() {
        solicitudes.incrementAndGet();
        sucio.set(true);
        programar();
    }

    /** Encola la tarea si no hay otra pendiente; la que haya vera la marca. */
    private void programar() {
        if (!programada.compareAndSet(false, true)) {
            return;
        }
        try {
            ejecutor.execute(this::refrescarMientrasSucio);
        } catch (TaskRejectedException e) {
            programada.set(false);
            log.warn("Cola del refresco del indice de desempeno llena: queda marcado y lo refresca el siguiente evento");
        }
    }

    /**
     * Corre en el executor del indice. Solo lanza un {@code Error}, y despues
     * de dejar la marca puesta.
     */
    private void refrescarMientrasSucio() {
        boolean fallo = false;
        long solicitudesAlFallar = 0;
        try {
            while (sucio.getAndSet(false)) {
                long solicitudesAlEmpezar = solicitudes.get();
                try {
                    desempenoService.refrescarIndice();
                } catch (Throwable e) {
                    // Sin reintentar aqui: con la base caida seria un bucle.
                    sucio.set(true);
                    fallo = true;
                    solicitudesAlFallar = solicitudesAlEmpezar;
                    if (e instanceof Error error) {
                        throw error;
                    }
                    log.error("No se pudo refrescar el indice de desempeno; queda marcado y lo "
                            + "reintenta el siguiente evento o el arranque", e);
                    break;
                }
            }
            alSalirDelBucle.run();
        } finally {
            programada.set(false);
        }
        // Tras un exito: un evento que marco entre la ultima lectura y el
        // set(false) no pudo encolar (esta tarea seguia programada); se encola
        // ahora por el. Tras un fallo: solo si llegaron eventos desde que
        // empezo el intento fallido (un intento mas por esa tanda, nunca un
        // bucle sin eventos).
        boolean hayQueSeguir = fallo ? solicitudes.get() != solicitudesAlFallar : sucio.get();
        if (hayQueSeguir) {
            programar();
        }
    }
}
