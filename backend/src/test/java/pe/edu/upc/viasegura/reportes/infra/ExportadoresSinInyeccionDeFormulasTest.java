package pe.edu.upc.viasegura.reportes.infra;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.upc.viasegura.reportes.port.TextoLibre;

/**
 * SEC-04 (CWE-1236): el texto libre de la exportacion no se ejecuta como
 * formula al abrir el archivo en una hoja de calculo.
 */
class ExportadoresSinInyeccionDeFormulasTest {

    private final CsvReportesExportador csv = new CsvReportesExportador();
    private final ExcelReportesExportador xlsx = new ExcelReportesExportador();

    /** Una sola linea de datos del CSV (sin BOM ni encabezado). */
    private String lineaCsv(Object valor) {
        byte[] cuerpo = csv.escribir(List.of("C"), List.of(List.of(valor)));
        String texto = new String(cuerpo, 3, cuerpo.length - 3, StandardCharsets.UTF_8);
        return texto.split("\n")[1];
    }

    @ParameterizedTest(name = "texto libre que empieza por {0} -> apostrofo")
    @ValueSource(strings = {"=1+1", "+51 999", "-2+3 bache", "@SUMA(A1)", "\tx", "\rx"})
    void csv_textoLibreQueEmpiezaComoFormula_llevaApostrofo(String valor) {
        assertThat(lineaCsv(new TextoLibre(valor))).isEqualTo("\"'" + valor + "\"");
    }

    @Test
    void csv_lasComillasSeEscapanDespuesDeNeutralizar() {
        assertThat(lineaCsv(new TextoLibre("=HYPERLINK(\"http://malo.example\",\"Ver\")")))
                .isEqualTo("\"'=HYPERLINK(\"\"http://malo.example\"\",\"\"Ver\"\")\"");
    }

    @Test
    void csv_noTocaElTextoLibreNormal_niLoQueArmaElSistema_niLosNumeros() {
        assertThat(lineaCsv(new TextoLibre("Bache = peligro"))).isEqualTo("\"Bache = peligro\"");
        assertThat(lineaCsv(new TextoLibre(""))).isEqualTo("\"\"");
        // La ubicacion de Lima empieza por "-" y la arma el sistema: sin apostrofo.
        assertThat(lineaCsv("-12.121500, -77.029700")).isEqualTo("\"-12.121500, -77.029700\"");
        assertThat(lineaCsv(-3)).isEqualTo("\"-3\"");
    }

    @Test
    void xlsx_textoLibreQueEmpiezaComoFormula_esCeldaDeTextoSinApostrofo() throws Exception {
        byte[] cuerpo = xlsx.escribir(List.of("A", "B"),
                List.of(List.<Object>of(new TextoLibre("=1+1"), new TextoLibre("@SUMA(A1)"))));

        try (XSSFWorkbook libro = new XSSFWorkbook(new ByteArrayInputStream(cuerpo))) {
            for (Cell celda : libro.getSheetAt(0).getRow(1)) {
                assertThat(celda.getCellType()).isEqualTo(CellType.STRING);
            }
            assertThat(libro.getSheetAt(0).getRow(1).getCell(0).getStringCellValue()).isEqualTo("=1+1");
            assertThat(libro.getSheetAt(0).getRow(1).getCell(1).getStringCellValue()).isEqualTo("@SUMA(A1)");
        }
    }
}
