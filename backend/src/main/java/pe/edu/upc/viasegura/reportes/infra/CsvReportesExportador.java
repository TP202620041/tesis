package pe.edu.upc.viasegura.reportes.infra;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.reportes.port.ExportadorReportes;

/**
 * Exportacion a CSV (US-28).
 *
 * <p>No usa libreria: es texto delimitado por comas, escribirlo a mano es
 * directo y una dependencia extra no aportaria nada. Cada valor va entre
 * comillas dobles y las comillas internas se duplican (RFC 4180), tambien en
 * los encabezados: «Ubicación (lat, lon)» lleva una coma.</p>
 *
 * <p><b>Con BOM UTF-8</b> (QA-1 M-5). Excel en Windows abre un CSV sin BOM con
 * la pagina de codigos del sistema y muestra «SemaforizaciÃ³n»; con los bytes
 * {@code EF BB BF} al inicio lo lee como UTF-8. Los lectores de CSV que
 * siguen el estandar (LibreOffice, pandas con {@code utf-8-sig}) lo
 * ignoran.</p>
 */
@Component
public class CsvReportesExportador implements ExportadorReportes {

    static final byte[] BOM_UTF8 = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};

    @Override
    public String extension() {
        return "csv";
    }

    @Override
    public String tipoContenido() {
        return "text/csv;charset=UTF-8";
    }

    @Override
    public byte[] escribir(List<String> columnas, List<List<Object>> filas) {
        StringBuilder sb = new StringBuilder();
        linea(sb, columnas);
        for (List<Object> valores : filas) {
            linea(sb, valores);
        }
        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        salida.writeBytes(BOM_UTF8);
        salida.writeBytes(sb.toString().getBytes(StandardCharsets.UTF_8));
        return salida.toByteArray();
    }

    private static void linea(StringBuilder sb, List<?> valores) {
        for (int i = 0; i < valores.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(String.valueOf(valores.get(i)).replace("\"", "\"\"")).append('"');
        }
        sb.append('\n');
    }
}
