package pe.edu.upc.viasegura.desempeno.listener;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
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
 * <p>Se ejecuta {@code AFTER_COMMIT}: el refresh solo corre si el cambio se
 * confirmo, nunca sobre una transaccion que despues hizo rollback. Como
 * {@code REFRESH} recalcula la vista completa, cualquiera de estos eventos
 * deja todo el indice al dia.</p>
 */
@Component
@RequiredArgsConstructor
public class IndiceDesempenoRefreshListener {

    private final DesempenoService desempenoService;

    /** Un reporte nuevo suma al denominador de la tasa de resolucion. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCrearReporte(ReporteCreadoEvent evento) {
        desempenoService.refrescarIndice();
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
            desempenoService.refrescarIndice();
        }
    }

    /** Mover un reporte de categoria altera el desglose de US-20. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCambiarCategoria(ReporteCategoriaCambiadaEvent evento) {
        desempenoService.refrescarIndice();
    }

    /** Una nueva calificacion cambia la satisfaccion promedio. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCalificar(CalificacionRegistradaEvent evento) {
        desempenoService.refrescarIndice();
    }

    /**
     * NC-11a: un reporte oculto por el ADMIN no cuenta en el indice (V21);
     * ocultarlo o restablecerlo mueve el total, los resueltos y la
     * satisfaccion de su distrito y de su categoria.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void alCambiarVisibilidad(ReporteVisibilidadCambiadaEvent evento) {
        desempenoService.refrescarIndice();
    }
}
