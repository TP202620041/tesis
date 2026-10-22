package pe.edu.upc.viasegura.reportes.port;

import java.util.Objects;

/**
 * Celda de la exportacion con texto que escribio una persona: el titulo del
 * ciudadano, el nombre de una categoria de distrito o el responsable que
 * anota el funcionario (SEC-04).
 *
 * <p>El servicio marca asi las celdas que no controla el sistema, para que
 * cada formato decida como volverlas inofensivas: el CSV antepone un
 * apostrofo si empiezan como una formula de hoja de calculo
 * ({@code CsvReportesExportador}); el XLSX las escribe como celda de texto,
 * que Excel nunca evalua. Los valores que arma el sistema (estado,
 * severidad, fechas, ubicacion) van como {@link String} y no se tocan.</p>
 *
 * @param valor el texto, nunca {@code null} (una celda vacia es {@code ""})
 */
public record TextoLibre(String valor) {

    public TextoLibre {
        Objects.requireNonNull(valor, "valor");
    }
}
