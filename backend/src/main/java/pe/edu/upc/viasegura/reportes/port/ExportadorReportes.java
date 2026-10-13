package pe.edu.upc.viasegura.reportes.port;

import java.util.List;

/**
 * Escritura del archivo de exportacion de reportes en un formato concreto
 * (US-28). Patron Strategy, como {@code GeoAssignmentStrategy}.
 *
 * <p>El servicio de aplicacion ({@code ExportarReportesService}) arma las
 * filas (que reportes, que columnas, como se formatea cada valor); cada
 * implementacion solo serializa esa tabla a bytes. Asi el servicio no
 * conoce Apache POI ni las reglas de escape de CSV.</p>
 */
public interface ExportadorReportes {

    /** Extension del archivo que produce, en minusculas ({@code "csv"}, {@code "xlsx"}); identifica el formato. */
    String extension();

    /** Media type del archivo producido. */
    String tipoContenido();

    /**
     * Serializa la tabla.
     *
     * @param columnas encabezados, en orden
     * @param filas valores de texto de cada fila, en el mismo orden que {@code columnas}
     */
    byte[] escribir(List<String> columnas, List<List<String>> filas);
}
