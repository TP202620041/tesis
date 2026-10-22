package pe.edu.upc.viasegura.reportes.infra;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.reportes.port.ExportadorReportes;
import pe.edu.upc.viasegura.reportes.port.TextoLibre;

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
 *
 * <p><b>Sin inyeccion de formulas</b> (SEC-04, CWE-1236). Excel evalua como
 * formula una celda de CSV que empieza por {@code =}, {@code +}, {@code -},
 * {@code @}, tabulador o retorno de carro, aunque vaya entre comillas. Un
 * titulo como {@code =HYPERLINK("http://…";"Ver")} se convertiria en un
 * enlace en la hoja del funcionario. A las celdas {@link TextoLibre} que
 * empiezan asi se les antepone un apostrofo, la neutralizacion que recomienda
 * OWASP. Solo a esas: la ubicacion de Lima empieza por {@code -} y la arma el
 * sistema, igual que los numeros.</p>
 */
@Component
public class CsvReportesExportador implements ExportadorReportes {

    static final byte[] BOM_UTF8 = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};

    /** Primeros caracteres con los que una hoja de calculo interpreta una formula (OWASP, CSV Injection). */
    static final String INICIOS_DE_FORMULA = "=+-@\t\r";

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

    /** Texto de la celda antes del escape de comillas: el texto libre, neutralizado. */
    static String texto(Object valor) {
        if (valor instanceof TextoLibre libre) {
            return neutralizarFormula(libre.valor());
        }
        return String.valueOf(valor);
    }

    static String neutralizarFormula(String texto) {
        if (!texto.isEmpty() && INICIOS_DE_FORMULA.indexOf(texto.charAt(0)) >= 0) {
            return "'" + texto;
        }
        return texto;
    }

    private static void linea(StringBuilder sb, List<?> valores) {
        for (int i = 0; i < valores.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(texto(valores.get(i)).replace("\"", "\"\"")).append('"');
        }
        sb.append('\n');
    }
}
