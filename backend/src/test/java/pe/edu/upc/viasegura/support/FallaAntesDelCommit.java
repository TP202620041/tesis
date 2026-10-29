package pe.edu.upc.viasegura.support;

import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import pe.edu.upc.viasegura.reportes.event.ReporteCreadoEvent;

/**
 * Listener de prueba (BE-11): con {@link #activar()}, hace fallar la
 * transaccion de la creacion de un reporte justo antes del commit, con el
 * reporte ya insertado. Spring la revierte como ante un error real de la base
 * y {@code afterCompletion} recibe {@code STATUS_ROLLED_BACK}.
 *
 * <p>Se agrega con {@code @Import} solo en los IT que lo necesitan, y cada
 * test empieza con {@link #desactivar()}.</p>
 */
public class FallaAntesDelCommit {

    private final AtomicBoolean activa = new AtomicBoolean();

    public void activar() {
        activa.set(true);
    }

    public void desactivar() {
        activa.set(false);
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void alCrear(ReporteCreadoEvent evento) {
        if (activa.get()) {
            throw new IllegalStateException("Falla de prueba antes del commit");
        }
    }
}
