package pe.edu.upc.viasegura.reportes.infra;

import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.reportes.port.ExportadorReportes;

/**
 * Exportacion a CSV (US-28).
 *
 * <p>No usa libreria: es texto delimitado por comas, escribirlo a mano es
 * directo y una dependencia extra no aportaria nada. Cada valor va entre
 * comillas dobles y las comillas internas se duplican (RFC 4180).</p>
 */
@Component
public class CsvReportesExportador implements ExportadorReportes {

    @Override
    public String extension() {
        return "csv";
    }

    @Override
    public String tipoContenido() {
        return "text/csv";
    }

    @Override
    public byte[] escribir(List<String> columnas, List<List<String>> filas) {
        StringBuilder sb = new StringBuilder();
        sb.append(String.join(",", columnas)).append('\n');
        for (List<String> valores : filas) {
            for (int i = 0; i < valores.size(); i++) {
                if (i > 0) {
                    sb.append(',');
                }
                sb.append('"').append(valores.get(i).replace("\"", "\"\"")).append('"');
            }
            sb.append('\n');
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }
}
