package pe.edu.upc.viasegura.common.exception;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * El nombre de la restriccion de la base que provoco una
 * {@link DataIntegrityViolationException} (p. ej. {@code reporte_creador_id_fkey}),
 * para registrarlo sin copiar al log el mensaje del controlador, que trae
 * valores de las filas. Vive aqui y no en el servicio que la usa porque
 * depende de la excepcion de Hibernate, un detalle de persistencia que no va
 * en {@code service/} (ARCHITECTURE.md §4.2). La usa la purga de cuentas sin
 * confirmar (BE-15).
 */
public final class RestriccionDeIntegridad {

    public static final String DESCONOCIDA = "restriccion desconocida";

    private RestriccionDeIntegridad() {
    }

    /** El nombre de la restriccion, o {@value #DESCONOCIDA} si la causa no lo trae. */
    public static String nombreDe(DataIntegrityViolationException error) {
        for (Throwable causa = error; causa != null; causa = causa.getCause()) {
            if (causa instanceof ConstraintViolationException violacion && violacion.getConstraintName() != null) {
                return violacion.getConstraintName();
            }
        }
        return DESCONOCIDA;
    }
}
