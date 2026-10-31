package pe.edu.upc.viasegura.reportes.listener;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.reportes.event.ReporteCreadoEvent;
import pe.edu.upc.viasegura.reportes.service.SugerenciaCategoriaService;

/**
 * Dispara la sugerencia oficial de categoria de un reporte nuevo (NC-04, D-08,
 * ARCHITECTURE.md 4.3 paso 3).
 *
 * <p>{@code AFTER_COMMIT}: solo se clasifica un reporte que de verdad se
 * guardo, y la clasificacion no forma parte de la transaccion de la creacion.
 * Escucha {@link ReporteCreadoEvent}, que no se publica en una adhesion
 * (US-09): adherirse no crea un reporte ni lo vuelve a clasificar. Sin foto no
 * hay nada que clasificar y no se encola nada.</p>
 *
 * <p>Como {@code ReporteEstadoCambiadoListener} (D-13), solo encola
 * {@link SugerenciaCategoriaService#sugerir}, que es {@code @Async} en el
 * executor acotado de las sugerencias ({@code AsyncConfig}, NC-04c): la
 * respuesta al ciudadano no espera al clasificador. Si la cola esta llena, el executor rechaza la tarea y aqui
 * se registra que sugerencia se pierde, sin reintentar en el hilo de la
 * peticion. Perderla se acepta: el reporte no depende de ella, y para la
 * evaluacion (OE3) un reporte sin sugerencia es uno sin dato, no uno
 * equivocado.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SugerenciaCategoriaListener {

    private final SugerenciaCategoriaService sugerenciaCategoriaService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCrearReporte(ReporteCreadoEvent evento) {
        if (!evento.conFoto()) {
            return;
        }
        try {
            sugerenciaCategoriaService.sugerir(evento.reporteId());
        } catch (TaskRejectedException e) {
            log.warn("Cola asincrona llena: se pierde la sugerencia de categoria del reporte {}",
                    evento.reporteId());
        }
    }
}
