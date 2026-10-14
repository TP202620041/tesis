package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.util.UUID;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.geo.GeometryUtils;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Exportacion de reportes del distrito a CSV/XLSX (US-28). */
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

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
    }

    private Usuario ciudadano() {
        return usuarioRepository.save(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private Usuario funcionario(Distrito distritoGestion) {
        return usuarioRepository.save(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).distrito(distritoGestion).build());
    }

    private Reporte reporte(Distrito distrito, EstadoReporte estado) {
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria()).creador(ciudadano()).distrito(distrito)
                .estado(estado).totalAdhesiones(1).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
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

        String csv = new String(cuerpo, java.nio.charset.StandardCharsets.UTF_8);
        assertThat(csv).contains("Categoria", "Ubicacion", "Fecha de reporte",
                "Fecha de resolucion", "Responsable asignado");
        // Encabezado + 2 filas de datos.
        assertThat(csv.strip().split("\n")).hasSize(3);
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
            assertThat(hoja.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Categoria");
            // Fila 1 (indice 1) es el unico reporte creado.
            assertThat(hoja.getLastRowNum()).isEqualTo(1);
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

        String csv = new String(cuerpo, java.nio.charset.StandardCharsets.UTF_8);
        // Encabezado + 1 sola fila (el PENDIENTE quedo fuera).
        assertThat(csv.strip().split("\n")).hasSize(2);
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
                        .value(org.hamcrest.Matchers.containsString("fechaDesde no puede ser posterior")));
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
