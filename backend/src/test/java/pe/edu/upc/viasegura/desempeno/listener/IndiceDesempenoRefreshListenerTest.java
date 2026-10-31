package pe.edu.upc.viasegura.desempeno.listener;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import pe.edu.upc.viasegura.common.config.AsyncConfig;
import pe.edu.upc.viasegura.desempeno.service.DesempenoService;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.event.CalificacionRegistradaEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteCategoriaCambiadaEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteCreadoEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteEstadoCambiadoEvent;
import pe.edu.upc.viasegura.reportes.event.ReporteVisibilidadCambiadaEvent;

/**
 * BE-12: el refresco del indice, asincrono y coalescido, sin contexto de
 * Spring y con el executor real del indice ({@link AsyncConfig#ejecutorIndice}).
 * El mismo comportamiento contra la base y por los endpoints lo prueba
 * {@code IndiceCoalescidoIT}.
 */
class IndiceDesempenoRefreshListenerTest {

    private static final ReporteCreadoEvent CREADO = new ReporteCreadoEvent(1L, 2L, 3L, true);

    private final DesempenoService servicio = mock(DesempenoService.class);
    private final ThreadPoolTaskExecutor ejecutor = (ThreadPoolTaskExecutor) new AsyncConfig().ejecutorIndice();
    private final IndiceDesempenoRefreshListener listener = new IndiceDesempenoRefreshListener(servicio, ejecutor);

    @AfterEach
    void apagar() {
        ejecutor.shutdown();
    }

    private static ReporteEstadoCambiadoEvent estado(EstadoReporte nuevo) {
        return new ReporteEstadoCambiadoEvent(1L, 9L, 2L, "Miraflores", EstadoReporte.PENDIENTE, nuevo, null);
    }

    /** Bloquea el primer refresh hasta {@code soltar}; avisa en {@code empezo}. */
    private void retenerElPrimerRefresh(CountDownLatch empezo, CountDownLatch soltar) {
        AtomicInteger llamadas = new AtomicInteger();
        doAnswer(inv -> {
            if (llamadas.incrementAndGet() == 1) {
                empezo.countDown();
                assertThat(soltar.await(10, TimeUnit.SECONDS)).isTrue();
            }
            return null;
        }).when(servicio).refrescarIndice();
    }

    @Test
    void unEvento_unRefresh_enOtroHilo() {
        List<String> hilos = new CopyOnWriteArrayList<>();
        doAnswer(inv -> {
            hilos.add(Thread.currentThread().getName());
            return null;
        }).when(servicio).refrescarIndice();

        listener.alCrearReporte(CREADO);

        verify(servicio, timeout(5_000)).refrescarIndice();
        verify(servicio, after(200).times(1)).refrescarIndice();
        assertThat(hilos).singleElement().asString().startsWith("viasegura-indice-");
    }

    @Test
    void muchosEventosDuranteUnRefresh_unoSoloMas_yElQuePublicaNoEspera() throws Exception {
        CountDownLatch empezo = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        retenerElPrimerRefresh(empezo, soltar);
        try {
            listener.alCrearReporte(CREADO);
            assertThat(empezo.await(5, TimeUnit.SECONDS)).isTrue();

            // Con el refresh retenido, los 15 eventos siguientes vuelven sin
            // esperarlo: si esperaran, este bucle no terminaria antes de soltar.
            long inicio = System.nanoTime();
            for (int i = 0; i < 15; i++) {
                listener.alCrearReporte(CREADO);
            }
            assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - inicio)).isLessThan(1_000);
            verify(servicio, times(1)).refrescarIndice();
        } finally {
            soltar.countDown();
        }

        // 16 eventos, 2 refrescos: el retenido y uno final por los 15.
        verify(servicio, timeout(5_000).times(2)).refrescarIndice();
        verify(servicio, after(300).times(2)).refrescarIndice();
    }

    @Test
    void cadaEventoQueMueveElIndice_refresca_yLosDemasNo() {
        listener.alCambiarEstado(estado(EstadoReporte.RECIBIDO));
        listener.alCambiarEstado(estado(EstadoReporte.EN_PROCESO));
        listener.alCambiarEstado(estado(EstadoReporte.RECHAZADO));
        verify(servicio, after(200).never()).refrescarIndice();

        int esperados = 0;
        for (Runnable evento : List.<Runnable>of(
                () -> listener.alCrearReporte(CREADO),
                () -> listener.alCambiarEstado(estado(EstadoReporte.RESUELTO)),
                () -> listener.alCambiarEstado(estado(EstadoReporte.CANCELADO)),
                () -> listener.alCambiarCategoria(new ReporteCategoriaCambiadaEvent(1L, 2L, 3L, 4L)),
                () -> listener.alCalificar(new CalificacionRegistradaEvent(1L)),
                () -> listener.alCambiarVisibilidad(new ReporteVisibilidadCambiadaEvent(1L, 2L, true)),
                () -> listener.alCambiarVisibilidad(new ReporteVisibilidadCambiadaEvent(1L, 2L, false)),
                listener::alArrancar)) {
            evento.run();
            // Uno a la vez, esperando su refresh: ninguno se coalesce con otro.
            verify(servicio, timeout(5_000).times(++esperados)).refrescarIndice();
        }
    }

    @Test
    void siElExecutorRechaza_laMarcaQueda_yElSiguienteEventoLaRecoge() {
        AtomicInteger intentos = new AtomicInteger();
        TaskExecutor rechazaElPrimero = tarea -> {
            if (intentos.incrementAndGet() == 1) {
                throw new TaskRejectedException("cola llena");
            }
            ejecutor.execute(tarea);
        };
        IndiceDesempenoRefreshListener conRechazo = new IndiceDesempenoRefreshListener(servicio, rechazaElPrimero);

        conRechazo.alCrearReporte(CREADO);
        verify(servicio, after(200).never()).refrescarIndice();

        // Un evento que no mueve el indice no lo recoge; uno que si, si.
        conRechazo.alCambiarEstado(estado(EstadoReporte.RECIBIDO));
        verify(servicio, after(200).never()).refrescarIndice();
        conRechazo.alCalificar(new CalificacionRegistradaEvent(1L));
        verify(servicio, timeout(5_000).times(1)).refrescarIndice();
        assertThat(intentos).hasValue(2);
    }

    @Test
    void siElRefreshFalla_noReintentaEnBucle_yElSiguienteEventoLoReintenta() {
        doThrow(new IllegalStateException("base caida")).doNothing().when(servicio).refrescarIndice();

        listener.alCrearReporte(CREADO);
        verify(servicio, timeout(5_000).times(1)).refrescarIndice();
        // Sin eventos durante el intento fallido no hay reintento diferido.
        verify(servicio, after(300).times(1)).refrescarIndice();

        listener.alCrearReporte(CREADO);
        verify(servicio, timeout(5_000).times(2)).refrescarIndice();
    }

    @Test
    void conEventosDesdeVariosHilos_elUltimoRefreshEmpiezaDespuesDelUltimoEvento() throws Exception {
        // La garantia de la que depende la regla de backend/CLAUDE.md: por
        // muchos eventos que se coalescan, siempre hay un refresh que empieza
        // despues del ultimo. Cada evento suma 1 ANTES de publicarse; cada
        // refresh anota cuantos vio al empezar. El maximo anotado tiene que
        // ser el total.
        AtomicLong publicados = new AtomicLong();
        AtomicLong vistoPorElUltimo = new AtomicLong();
        AtomicInteger refrescos = new AtomicInteger();
        doAnswer(inv -> {
            vistoPorElUltimo.accumulateAndGet(publicados.get(), Math::max);
            refrescos.incrementAndGet();
            return null;
        }).when(servicio).refrescarIndice();

        int hilos = 8;
        int porHilo = 500;
        CountDownLatch largada = new CountDownLatch(1);
        List<Thread> publicadores = new ArrayList<>();
        for (int h = 0; h < hilos; h++) {
            Thread t = new Thread(() -> {
                try {
                    largada.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                for (int i = 0; i < porHilo; i++) {
                    publicados.incrementAndGet();
                    listener.alCrearReporte(CREADO);
                }
            });
            t.start();
            publicadores.add(t);
        }
        largada.countDown();
        for (Thread t : publicadores) {
            t.join(10_000);
        }

        long total = (long) hilos * porHilo;
        long limite = System.currentTimeMillis() + 5_000;
        while (vistoPorElUltimo.get() < total && System.currentTimeMillis() < limite) {
            Thread.sleep(10);
        }
        assertThat(vistoPorElUltimo).hasValue(total);
        assertThat(refrescos.get()).isPositive();
    }

    @Test
    void siElRefreshFalla_conEventosDuranteElIntento_seIntentaUnaVezMasPorEllos() throws Exception {
        CountDownLatch empezo = new CountDownLatch(1);
        CountDownLatch soltar = new CountDownLatch(1);
        AtomicInteger llamadas = new AtomicInteger();
        doAnswer(inv -> {
            if (llamadas.incrementAndGet() == 1) {
                empezo.countDown();
                assertThat(soltar.await(10, TimeUnit.SECONDS)).isTrue();
                throw new IllegalStateException("base caida");
            }
            return null;
        }).when(servicio).refrescarIndice();

        listener.alCrearReporte(CREADO);
        assertThat(empezo.await(5, TimeUnit.SECONDS)).isTrue();
        // Llega mientras el intento esta en curso: no puede encolar (la tarea
        // sigue programada) y el intento fallara.
        listener.alCalificar(new CalificacionRegistradaEvent(1L));
        soltar.countDown();

        verify(servicio, timeout(5_000).times(2)).refrescarIndice();
        verify(servicio, after(300).times(2)).refrescarIndice();
    }

    @Test
    void siElRefreshLanzaUnError_laMarcaQueda_yElSiguienteEventoLaRecoge() {
        doThrow(new StackOverflowError("simulado")).doNothing().when(servicio).refrescarIndice();

        listener.alCrearReporte(CREADO);
        verify(servicio, timeout(5_000).times(1)).refrescarIndice();
        verify(servicio, after(300).times(1)).refrescarIndice();

        // Un evento que no mueve el indice no refresca nada por si mismo: si
        // ahora hay refresh es porque la marca del Error quedo puesta y el
        // executor sigue aceptando tareas.
        listener.alCalificar(new CalificacionRegistradaEvent(1L));
        verify(servicio, timeout(5_000).times(2)).refrescarIndice();
    }

    @Test
    void unEventoEntreLaUltimaVueltaYElFinDeLaTarea_loRecogeLaRelectura() {
        // La ventana mas estrecha: el bucle ya vio la marca abajo, pero la
        // tarea todavia esta programada, asi que el evento no puede encolar.
        // Solo la relectura final lo recoge. El gancho publica el evento justo
        // ahi, una vez: sin la relectura habria un solo refresh.
        AtomicBoolean yaPublico = new AtomicBoolean();
        listener.alSalirDelBucle = () -> {
            if (yaPublico.compareAndSet(false, true)) {
                listener.alCrearReporte(CREADO);
            }
        };

        listener.alCrearReporte(CREADO);

        verify(servicio, timeout(5_000).times(2)).refrescarIndice();
        verify(servicio, after(300).times(2)).refrescarIndice();
        assertThat(yaPublico).isTrue();
    }
}
