package pe.edu.upc.viasegura.reportes.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.service.UsuarioConsultaService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.RangoFechas;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.dto.FormatoExportacion;
import pe.edu.upc.viasegura.reportes.port.ExportadorReportes;
import pe.edu.upc.viasegura.reportes.repository.AsignacionResponsableRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;

/**
 * Exporta los reportes del distrito del funcionario a CSV o XLSX (US-28).
 *
 * <p>El servicio decide que reportes salen y arma las filas; la escritura
 * del archivo la hace el {@link ExportadorReportes} del formato pedido
 * ({@code infra/CsvReportesExportador}, {@code infra/ExcelReportesExportador}
 * con Apache POI), elegido por su extension.</p>
 *
 * <p>Filtros sin resultados (Esc.2 del backlog): {@link IllegalArgumentException}
 * (400 con mensaje claro) en vez de generar un archivo vacio -- de las dos
 * opciones evaluadas (204 vs 400), 204 no admite cuerpo de respuesta por
 * especificacion, asi que no puede llevar el "mensaje claro" pedido.</p>
 */
@Service
public class ExportarReportesService {

    private static final DateTimeFormatter FORMATO_FECHA =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneOffset.UTC);

    private final ReporteRepository reporteRepository;
    private final UsuarioConsultaService usuarioConsultaService;
    private final AsignacionResponsableRepository asignacionRepository;
    private final Map<String, ExportadorReportes> exportadores;

    public ExportarReportesService(ReporteRepository reporteRepository,
                                   UsuarioConsultaService usuarioConsultaService,
                                   AsignacionResponsableRepository asignacionRepository,
                                   List<ExportadorReportes> exportadores) {
        this.reporteRepository = reporteRepository;
        this.usuarioConsultaService = usuarioConsultaService;
        this.asignacionRepository = asignacionRepository;
        this.exportadores = exportadores.stream()
                .collect(Collectors.toMap(ExportadorReportes::extension, Function.identity()));
    }

    public record Exportacion(byte[] contenido, String tipoContenido, String nombreArchivo) {}

    @Transactional(readOnly = true)
    public Exportacion exportar(String emailFuncionario, FormatoExportacion formato,
                                 Long categoriaId, EstadoReporte estado,
                                 Instant fechaDesde, Instant fechaHasta) {
        RangoFechas.validar(fechaDesde, fechaHasta);
        Usuario funcionario = usuarioConsultaService.usuarioPorEmail(emailFuncionario);
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

        ExportadorReportes exportador = exportadores.get(formato.name().toLowerCase(Locale.ROOT));
        if (exportador == null) {
            throw new IllegalStateException("No hay exportador para el formato " + formato);
        }
        List<List<String>> filas = reportes.stream().map(this::fila).toList();
        String nombreArchivo = "reportes-" + distrito.getNombre().toLowerCase().replace(' ', '-')
                + "." + exportador.extension();
        return new Exportacion(exportador.escribir(COLUMNAS, filas), exportador.tipoContenido(), nombreArchivo);
    }

    private static final List<String> COLUMNAS =
            List.of("Categoria", "Ubicacion (lat, lon)", "Fecha de reporte", "Fecha de resolucion", "Responsable asignado");

    private List<String> fila(Reporte r) {
        String responsable = asignacionRepository.findByReporteIdAndActivoTrue(r.getId())
                .map(a -> a.getResponsable())
                .orElse("");
        return List.of(
                r.getCategoria().getNombre(),
                "%.6f, %.6f".formatted(r.getUbicacion().getY(), r.getUbicacion().getX()),
                FORMATO_FECHA.format(r.getCreatedAt()),
                r.getResolvedAt() != null ? FORMATO_FECHA.format(r.getResolvedAt()) : "",
                responsable);
    }
}
