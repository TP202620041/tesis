package pe.edu.upc.viasegura.reportes.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import pe.edu.upc.viasegura.common.port.FotoStorageService;

/**
 * BE-11: la foto de un reporte ya saneada y subida <b>antes</b> de abrir la
 * transaccion de creacion, cuando todavia no se sabe si algun reporte la va a
 * usar.
 *
 * <p>Puede que ninguno la use: la transaccion se revierte (un error, o la
 * misma {@code Idempotency-Key} confirmada por otro envio), el pedido termina
 * en una adhesion (US-09) o resulta ser un reenvio idempotente (US-06). En
 * esos casos se borra; si no, quedaria huerfana en el bucket.</p>
 *
 * <p><b>Como se decide.</b> La transaccion de creacion la registra como
 * sincronizacion ({@link #acompanarTransaccionActual}), y en
 * {@link #afterCompletion} se conoce su desenlace real:</p>
 * <ul>
 *   <li>confirmada y usada por el reporte nuevo ({@link #usarEnReporte}): se
 *       conserva;</li>
 *   <li>revertida, o confirmada sin que nadie la use: se borra;</li>
 *   <li>desenlace desconocido ({@code STATUS_UNKNOWN}: fallo el commit y no se
 *       sabe si el reporte llego a la base) y usada: se conserva, con un WARN.
 *       Un reporte publicado sin su foto es peor que un objeto huerfano.</li>
 * </ul>
 *
 * <p><b>Cuando se borra.</b> No dentro de {@code afterCompletion}: Spring la
 * llama antes de devolver la conexion al pool (lo hace despues, en
 * {@code cleanupAfterCompletion}), y borrar en R2 es una llamada de red, que
 * la retendria. {@link #resolver()} borra apenas vuelve la transaccion, ya
 * sin conexion tomada, con la decision que dejo {@code afterCompletion}. Si la
 * transaccion ni siquiera empezo (no hubo conexion), la foto nunca se
 * registro y {@link #resolver()} tambien la borra.</p>
 *
 * <p>Vive un solo pedido y en un solo hilo: no necesita sincronizacion.</p>
 */
@Slf4j
final class FotoProvisional implements TransactionSynchronization {

    private final FotoStorageService almacenamiento;
    private final String url;
    private boolean registrada;
    private boolean usada;
    /** {@code STATUS_*} de {@link #afterCompletion}; {@code null} mientras no termine la transaccion. */
    private Integer desenlace;

    FotoProvisional(FotoStorageService almacenamiento, String url) {
        this.almacenamiento = almacenamiento;
        this.url = url;
    }

    /** La registra en la transaccion en curso, para conocer su desenlace. */
    void acompanarTransaccionActual() {
        TransactionSynchronizationManager.registerSynchronization(this);
        registrada = true;
    }

    /** El reporte nuevo la usa: devuelve la URL que se guarda en {@code reporte.foto_url}. */
    String usarEnReporte() {
        usada = true;
        return url;
    }

    @Override
    public void afterCompletion(int status) {
        desenlace = status;
    }

    /**
     * Despues de la transaccion de creacion, bien o mal, y sin conexion
     * tomada: borra la foto si ningun reporte confirmado la usa. Nunca lanza
     * ({@link FotoStorageService#eliminarFotoReporte} no lanza).
     */
    void resolver() {
        if (registrada && desenlace == null) {
            // La transaccion sigue abierta: crear() corrio dentro de otra, que
            // ReporteService#crear rechaza. Por si acaso, no se borra la foto
            // de un reporte que todavia puede confirmarse.
            log.error("La transaccion de la foto {} no termino al volver de la creacion; se conserva", nombre());
            return;
        }
        if (usada && desenlace != null && desenlace == STATUS_COMMITTED) {
            return;
        }
        if (usada && desenlace != null && desenlace == STATUS_UNKNOWN) {
            log.warn("No se sabe si se confirmo el reporte con la foto {}: se conserva, puede quedar huerfana",
                    nombre());
            return;
        }
        almacenamiento.eliminarFotoReporte(nombre());
    }

    /** {@code <uuid>.jpg}: el ultimo segmento de la URL que devolvio el almacenamiento. */
    private String nombre() {
        return FotoStorageService.nombreDeArchivo(url);
    }
}
