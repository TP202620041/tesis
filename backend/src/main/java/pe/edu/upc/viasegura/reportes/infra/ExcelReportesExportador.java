package pe.edu.upc.viasegura.reportes.infra;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;
import pe.edu.upc.viasegura.reportes.port.ExportadorReportes;

/**
 * Exportacion a XLSX con Apache POI (US-28).
 *
 * <p>Apache POI: estandar del ecosistema Java para el formato OOXML (no es
 * un simple delimitado, requiere el zip/XML de Office).</p>
 */
@Component
public class ExcelReportesExportador implements ExportadorReportes {

    @Override
    public String extension() {
        return "xlsx";
    }

    @Override
    public String tipoContenido() {
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    @Override
    public byte[] escribir(List<String> columnas, List<List<String>> filas) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFSheet hoja = workbook.createSheet("Reportes");
            Row encabezado = hoja.createRow(0);
            for (int i = 0; i < columnas.size(); i++) {
                encabezado.createCell(i).setCellValue(columnas.get(i));
            }
            int filaIdx = 1;
            for (List<String> valores : filas) {
                Row filaExcel = hoja.createRow(filaIdx++);
                for (int i = 0; i < valores.size(); i++) {
                    filaExcel.createCell(i).setCellValue(valores.get(i));
                }
            }
            for (int i = 0; i < columnas.size(); i++) {
                hoja.autoSizeColumn(i);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo generar el archivo XLSX", e);
        }
    }
}
