package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFRow;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.AsignacionResponsable;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.AsignacionResponsableRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Exportacion de reportes del distrito a CSV/XLSX (US-28; columnas, hora de Lima y BOM de QA-1 M-5). */
class ExportarReportesIT extends AbstractPostgisIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    DistritoRepository distritoRepository;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    JdbcTemplate jdbcTemplate;
    @Autowired
    AsignacionResponsableRepository asignacionRepository;

    /** Encabezados en el orden del archivo (QA-1 M-5). */
    private static final List<String> COLUMNAS = List.of(
            "ID", "Título", "Categoría", "Estado", "Severidad", "Adhesiones", "Ubicación (lat, lon)",
            "Fecha de reporte (hora de Lima)", "Fecha de resolución (hora de Lima)", "Responsable asignado");

    /** 2026-10-21 20:28 en Lima (UTC-5): el caso del informe QA-1, que salía como 01:28 del 22. */
    private static final Instant CREADO = Instant.parse("2026-10-22T01:28:00Z");
    private static final Instant RESUELTO = Instant.parse("2026-10-22T03:05:00Z");

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private Usuario funcionario(Distrito distritoGestion) {
        return guardarConTerminos(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).distrito(distritoGestion).build());
    }

    private Reporte reporte(Distrito distrito, EstadoReporte estado) {
        return reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria()).creador(ciudadano()).distrito(distrito)
                .estado(estado).totalAdhesiones(1).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    /** Reporte con todos los datos que exporta la fila, y la fecha de creación fijada. */
    private Reporte reporteCompleto(Distrito distrito, CategoriaDano categoria, String titulo, EstadoReporte estado,
                                    Severidad severidad, int adhesiones, Instant resuelto) {
        Reporte r = reporteRepository.save(Reporte.builder()
                .titulo(titulo).severidad(severidad)
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria).creador(ciudadano()).distrito(distrito)
                .estado(estado).totalAdhesiones(adhesiones).resolvedAt(resuelto).build());
        // El auditing pisa created_at en cada save: se fija por SQL.
        jdbcTemplate.update("UPDATE reporte SET created_at = ? WHERE id = ?", Timestamp.from(CREADO), r.getId());
        return r;
    }

    private byte[] exportar(Usuario func, String formato, String estado) throws Exception {
        var peticion = get("/api/reportes/exportar").param("formato", formato)
                .header("Authorization", "Bearer " + token(func));
        if (estado != null) {
            peticion = peticion.param("estado", estado);
        }
        return mockMvc.perform(peticion)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
    }

    private static List<String> filaDe(List<List<String>> filas, Reporte r) {
        return filas.stream().filter(f -> f.get(0).equals(r.getId().toString())).findFirst().orElseThrow();
    }

    /** CSV sin el BOM, en filas: comillas dobles con escape RFC 4180 (los valores pueden tener comas). */
    private static List<List<String>> leerCsv(byte[] cuerpo) {
        String texto = new String(cuerpo, 3, cuerpo.length - 3, StandardCharsets.UTF_8);
        List<List<String>> filas = new ArrayList<>();
        List<String> fila = new ArrayList<>();
        StringBuilder valor = new StringBuilder();
        boolean entreComillas = false;
        for (int i = 0; i < texto.length(); i++) {
            char c = texto.charAt(i);
            if (entreComillas) {
                if (c == '"' && i + 1 < texto.length() && texto.charAt(i + 1) == '"') {
                    valor.append('"');
                    i++;
                } else if (c == '"') {
                    entreComillas = false;
                } else {
                    valor.append(c);
                }
            } else if (c == '"') {
                entreComillas = true;
            } else if (c == ',') {
                fila.add(valor.toString());
                valor.setLength(0);
            } else if (c == '\n') {
                fila.add(valor.toString());
                valor.setLength(0);
                filas.add(fila);
                fila = new ArrayList<>();
            } else if (c != '\r') {
                valor.append(c);
            }
        }
        return filas;
    }

    @Test
    void funcionarioExportaCsv_200_conEncabezadosYFilas() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        reporte(miraflores, EstadoReporte.RESUELTO);
        reporte(miraflores, EstadoReporte.PENDIENTE);

        byte[] cuerpo = mockMvc.perform(get("/api/reportes/exportar")
                        .param("formato", "CSV")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        // QA-1 M-5: BOM UTF-8 para que Excel en Windows lea las tildes.
        assertThat(Arrays.copyOf(cuerpo, 3)).containsExactly(0xEF, 0xBB, 0xBF);
        List<List<String>> filas = leerCsv(cuerpo);
        // Encabezado + 2 filas de datos, todas con el mismo número de columnas
        // (antes «Ubicacion (lat, lon)» iba sin comillas y partía el encabezado).
        assertThat(filas).hasSize(3);
        assertThat(filas.get(0)).containsExactlyElementsOf(COLUMNAS);
        assertThat(filas).allSatisfy(fila -> assertThat(fila).hasSize(COLUMNAS.size()));
    }

    @Test
    void csv_filaConIdTituloEstadoSeveridadAdhesionesYFechasEnHoraDeLima() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano categoria = categoria();
        Reporte r = reporteCompleto(miraflores, categoria, "Semáforo \"peatonal\", esquina",
                EstadoReporte.RESUELTO, Severidad.ALTA, 3, RESUELTO);

        mockMvc.perform(get("/api/reportes/exportar").param("formato", "CSV")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/csv;charset=UTF-8"));
        List<List<String>> filas = leerCsv(exportar(func, "CSV", null));

        assertThat(filas).hasSize(2);
        assertThat(filas.get(1)).containsExactly(
                r.getId().toString(),
                "Semáforo \"peatonal\", esquina",
                categoria.getNombre(),
                "Resuelto",
                "Alta",
                "3",
                "-12.121500, -77.029700",
                "2026-10-21 20:28",
                "2026-10-21 22:05",
                "");
    }

    @Test
    void csv_textoLibreQueEmpiezaComoFormula_llevaApostrofo_yLaUbicacionNo() throws Exception {
        // SEC-04 (CWE-1236): el título lo escribe el ciudadano y el responsable,
        // el funcionario; abiertos en Excel, «=…», «-…» o «@…» se evaluarían
        // como fórmula. La ubicación también empieza por «-», pero la arma el
        // sistema: sin apostrofo.
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano categoria = categoria();
        Reporte igual = reporteCompleto(miraflores, categoria, "=HYPERLINK(\"http://malo.example\",\"Ver\")",
                EstadoReporte.EN_PROCESO, Severidad.MEDIA, 1, null);
        Reporte menos = reporteCompleto(miraflores, categoria, "-2+3 bache en la esquina",
                EstadoReporte.RECIBIDO, Severidad.MEDIA, 1, null);
        asignacionRepository.save(AsignacionResponsable.builder()
                .reporte(menos).responsable("@cuadrilla norte").asignadoPor(func).activo(true).build());

        List<List<String>> filas = leerCsv(exportar(func, "CSV", null));

        List<String> filaIgual = filaDe(filas, igual);
        assertThat(filaIgual.get(1)).isEqualTo("'=HYPERLINK(\"http://malo.example\",\"Ver\")");
        assertThat(filaIgual.get(6)).isEqualTo("-12.121500, -77.029700");
        List<String> filaMenos = filaDe(filas, menos);
        assertThat(filaMenos.get(1)).isEqualTo("'-2+3 bache en la esquina");
        assertThat(filaMenos.get(9)).isEqualTo("'@cuadrilla norte");
    }

    @Test
    void xlsx_textoLibreQueEmpiezaComoFormula_esCeldaDeTextoTalCual() throws Exception {
        // En el XLSX una celda de texto nunca se evalúa: va sin apostrofo.
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        reporteCompleto(miraflores, categoria(), "=1+1 bache grande", EstadoReporte.EN_PROCESO, Severidad.MEDIA, 1, null);

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(exportar(func, "XLSX", null)))) {
            XSSFRow fila = workbook.getSheetAt(0).getRow(1);
            assertThat(fila.getCell(1).getCellType()).isEqualTo(CellType.STRING);
            assertThat(fila.getCell(1).getStringCellValue()).isEqualTo("=1+1 bache grande");
        }
    }

    @Test
    void csv_losCanceladosSeDistinguenPorSuEstado() throws Exception {
        // QA-1 M-5: antes salían sin forma de distinguirlos del resto.
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        reporte(miraflores, EstadoReporte.CANCELADO);
        reporte(miraflores, EstadoReporte.EN_PROCESO);

        List<List<String>> filas = leerCsv(exportar(func, "CSV", null));

        assertThat(filas.subList(1, filas.size())).extracting(fila -> fila.get(3))
                .containsExactlyInAnyOrder("Cancelado", "En proceso");
    }

    @Test
    void funcionarioExportaXlsx_200_archivoValido() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        reporte(miraflores, EstadoReporte.RESUELTO);

        byte[] cuerpo = mockMvc.perform(get("/api/reportes/exportar")
                        .param("formato", "XLSX")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(cuerpo))) {
            XSSFSheet hoja = workbook.getSheetAt(0);
            for (int i = 0; i < COLUMNAS.size(); i++) {
                assertThat(hoja.getRow(0).getCell(i).getStringCellValue()).isEqualTo(COLUMNAS.get(i));
            }
            // Fila 1 (indice 1) es el unico reporte creado.
            assertThat(hoja.getLastRowNum()).isEqualTo(1);
        }
    }

    @Test
    void xlsx_idYAdhesionesNumericos_estadoConEtiqueta_yFechasEnHoraDeLima() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        Reporte r = reporteCompleto(miraflores, categoria(), "Vereda hundida frente al parque",
                EstadoReporte.RESUELTO, Severidad.BAJA, 12, RESUELTO);

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(exportar(func, "XLSX", null)))) {
            XSSFRow fila = workbook.getSheetAt(0).getRow(1);
            // Numéricos, para ordenar y sumar en la hoja de cálculo.
            assertThat(fila.getCell(0).getCellType()).isEqualTo(CellType.NUMERIC);
            assertThat(fila.getCell(0).getNumericCellValue()).isEqualTo(r.getId().doubleValue());
            assertThat(fila.getCell(5).getCellType()).isEqualTo(CellType.NUMERIC);
            assertThat(fila.getCell(5).getNumericCellValue()).isEqualTo(12.0);
            assertThat(fila.getCell(1).getStringCellValue()).isEqualTo("Vereda hundida frente al parque");
            assertThat(fila.getCell(3).getStringCellValue()).isEqualTo("Resuelto");
            assertThat(fila.getCell(4).getStringCellValue()).isEqualTo("Baja");
            assertThat(fila.getCell(7).getStringCellValue()).isEqualTo("2026-10-21 20:28");
            assertThat(fila.getCell(8).getStringCellValue()).isEqualTo("2026-10-21 22:05");
        }
    }

    @Test
    void filtroPorEstado_limitaFilasExportadas() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        reporte(miraflores, EstadoReporte.RESUELTO);
        reporte(miraflores, EstadoReporte.PENDIENTE);

        byte[] cuerpo = mockMvc.perform(get("/api/reportes/exportar")
                        .param("formato", "CSV")
                        .param("estado", "RESUELTO")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        // Encabezado + 1 sola fila (el PENDIENTE quedo fuera).
        List<List<String>> filas = leerCsv(cuerpo);
        assertThat(filas).hasSize(2);
        assertThat(filas.get(1).get(3)).isEqualTo("Resuelto");
    }

    @Test
    void sinResultados_400_conMensajeClaro() throws Exception {
        Usuario func = funcionario(distrito("Barranco"));

        mockMvc.perform(get("/api/reportes/exportar")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rangoDeFechasInvertido_400() throws Exception {
        // Hay un reporte exportable: el 400 viene del rango, no de "sin resultados".
        Distrito barranco = distrito("Barranco");
        Usuario func = funcionario(barranco);
        reporte(barranco, EstadoReporte.PENDIENTE);

        mockMvc.perform(get("/api/reportes/exportar")
                        .param("fechaDesde", "2026-02-01T00:00:00Z")
                        .param("fechaHasta", "2026-01-01T00:00:00Z")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("La fecha de inicio no puede ser posterior")));
    }

    @Test
    void ciudadanoNoPuedeExportar_403() throws Exception {
        mockMvc.perform(get("/api/reportes/exportar")
                        .header("Authorization", "Bearer " + token(ciudadano())))
                .andExpect(status().isForbidden());
    }

    @Test
    void sinToken_401() throws Exception {
        mockMvc.perform(get("/api/reportes/exportar"))
                .andExpect(status().isUnauthorized());
    }
}
