package pe.edu.upc.viasegura.clasificacion.port;

/**
 * El servicio de deteccion no pudo clasificar la foto: no respondio, se paso
 * del timeout o respondio algo que no cumple el contrato. Los adaptadores de
 * {@link ClasificadorDano} traducen sus errores a esta excepcion.
 *
 * <p>Nunca llega al cliente: la vista previa responde «sin sugerencia» y la
 * sugerencia oficial deja los campos nulos. La IA nunca bloquea un reporte
 * (ARCHITECTURE.md 4.3).</p>
 */
public class ClasificacionNoDisponibleException extends RuntimeException {

    public ClasificacionNoDisponibleException(String mensaje) {
        super(mensaje);
    }
}
