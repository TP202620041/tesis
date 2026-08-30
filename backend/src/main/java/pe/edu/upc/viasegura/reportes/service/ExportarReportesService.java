package pe.edu.upc.viasegura.reportes.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.ResourceNotFoundException;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.dto.FormatoExportacion;
import pe.edu.upc.viasegura.reportes.repository.AsignacionResponsableRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Exporta los reportes del distrito del funcionario a CSV o XLSX (US-28).
 *
 * <p>Apache POI para XLSX: estandar del ecosistema Java para el formato
 * OOXML (no es un simple delimitado, requiere el zip/XML de Office). CSV no
 * usa libreria: es texto delimitado por comas, escribirlo a mano es directo
 * y una dependencia extra no aportaria nada para este caso.</p>
 *
 * <p>Filtros sin resultados (Esc.2 del backlog): {@link IllegalArgumentException}
 * (400 con mensaje claro) en vez de generar un archivo vacio -- de las dos
 * opciones evaluadas (204 vs 400), 204 no admite cuerpo de respuesta por
 * especificacion, asi que no puede llevar el "mensaje claro" pedido.</p>
 */
@Service
@RequiredArgsConstructor
public class ExportarReportesService {

    private static final DateTimeFormatter FORMATO_FECHA =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneOffset.UTC);

    private final ReporteRepository reporteRepository;
    private final UsuarioRepository usuarioRepository;
    private final AsignacionResponsableRepository asignacionRepository;

    public record Exportacion(byte[] contenido, String tipoContenido, String nombreArchivo) {}

    @Transactional(readOnly = true)
    public Exportacion exportar(String emailFuncionario, FormatoExportacion formato,
                                 Long categoriaId, EstadoReporte estado,
                                 Instant fechaDesde, Instant fechaHasta) {
        Usuario funcionario = usuarioRepository.findByEmail(emailFuncionario)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        Distrito distrito = funcionario.getDistrito();
        if (distrito == null) {
            throw new AccessDeniedException("El funcionario no tiene un distrito de gestion asignado");
        }

        List<Reporte> reportes = reporteRepository.buscarParaExportar(
                distrito.getId(), categoriaId, estado != null ? estado.name() : null, fechaDesde, fechaHasta);
        if (reportes.isEmpty()) {
            throw new IllegalArgumentException(
                    "No hay reportes que coincidan con los filtros seleccionados para exportar");
        }

        String nombreBase = "reportes-" + distrito.getNombre().toLowerCase().replace(' ', '-');
        return switch (formato) {
            case CSV -> new Exportacion(generarCsv(reportes), "text/csv", nombreBase + ".csv");
            case XLSX -> new Exportacion(generarXlsx(reportes),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nombreBase + ".xlsx");
        };
    }

    private static final String[] COLUMNAS =
            {"Categoria", "Ubicacion (lat, lon)", "Fecha de reporte", "Fecha de resolucion", "Responsable asignado"};

    private String[] fila(Reporte r) {
        String responsable = asignacionRepository.findByReporteIdAndActivoTrue(r.getId())
                .map(a -> a.getResponsable())
                .orElse("");
        return new String[]{
                r.getCategoria().getNombre(),
                "%.6f, %.6f".formatted(r.getUbicacion().getY(), r.getUbicacion().getX()),
                FORMATO_FECHA.format(r.getCreatedAt()),
                r.getResolvedAt() != null ? FORMATO_FECHA.format(r.getResolvedAt()) : "",
                responsable
        };
    }

    private byte[] generarCsv(List<Reporte> reportes) {
        StringBuilder sb = new StringBuilder();
        sb.append(String.join(",", COLUMNAS)).append('\n');
        for (Reporte r : reportes) {
            String[] valores = fila(r);
            for (int i = 0; i < valores.length; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                sb.append('"').append(valores[i].replace("\"", "\"\"")).append('"');
            }
            sb.append('\n');
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private byte[] generarXlsx(List<Reporte> reportes) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFSheet hoja = workbook.createSheet("Reportes");
            Row encabezado = hoja.createRow(0);
            for (int i = 0; i < COLUMNAS.length; i++) {
                encabezado.createCell(i).setCellValue(COLUMNAS[i]);
            }
            int filaIdx = 1;
            for (Reporte r : reportes) {
                Row filaExcel = hoja.createRow(filaIdx++);
                String[] valores = fila(r);
                for (int i = 0; i < valores.length; i++) {
                    filaExcel.createCell(i).setCellValue(valores[i]);
                }
            }
            for (int i = 0; i < COLUMNAS.length; i++) {
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
