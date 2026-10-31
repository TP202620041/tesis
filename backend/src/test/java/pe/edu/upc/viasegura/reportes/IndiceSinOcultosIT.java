package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.desempeno.service.DesempenoService;
import pe.edu.upc.viasegura.reportes.domain.Calificacion;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.repository.CalificacionRepository;

/**
 * NC-11a (decision del usuario del 28/10): un reporte oculto por el ADMIN no
 * cuenta en el indice de desempeno ni sale en la exportacion. Ocultarlo y
 * restablecerlo refrescan la vista <b>por el evento</b>, sin llamarla a mano;
 * ocultar solo la foto no cambia nada.
 *
 * <p>Lee la vista materializada directamente, en la fila del distrito
 * ({@code <id>-ALL}) y en la de su categoria ({@code <id>-<categoria>}).</p>
 */
class IndiceSinOcultosIT extends AbstractModeracionIT {

    @Autowired
    DesempenoService desempenoService;
    @Autowired
    CalificacionRepository calificacionRepository;

    private Usuario admin;
    private Usuario funcionario;
    private Reporte resuelto;
    private Reporte pendienteConFoto;

    @BeforeEach
    void escenario() {
        admin = admin();
        funcionario = funcionario(miraflores());
        Usuario creador = ciudadano();

        resuelto = reporte(creador, EstadoReporte.RESUELTO, null);
        resuelto.setTitulo("Reporte resuelto que se ocultara");
        resuelto.setResolvedAt(Instant.now());
        resuelto = reporteRepository.save(resuelto);
        calificacionRepository.save(Calificacion.builder()
                .reporte(resuelto).usuario(creador).estrellas(4).build());

        pendienteConFoto = reporte(ciudadano(), EstadoReporte.PENDIENTE, fotoGuardada());
        pendienteConFoto.setTitulo("Reporte pendiente que sigue a la vista");
        pendienteConFoto = reporteRepository.save(pendienteConFoto);

        // Los datos se sembraron sin eventos: este es el unico refresco a mano.
        desempenoService.refrescarIndice();
    }

    private Map<String, Object> fila(Long categoriaId) {
        String id = miraflores().getId() + "-" + (categoriaId == null ? "ALL" : categoriaId.toString());
        return jdbcTemplate.queryForMap("""
                SELECT total_reportes, total_resueltos, total_calificaciones, calculated_at
                FROM mv_indice_desempeno_distrital WHERE id = ?""", id);
    }

    private void afirmar(Long categoriaId, long reportes, long resueltos, long calificaciones) {
        Map<String, Object> f = fila(categoriaId);
        assertThat(((Number) f.get("total_reportes")).longValue()).isEqualTo(reportes);
        assertThat(((Number) f.get("total_resueltos")).longValue()).isEqualTo(resueltos);
        assertThat(((Number) f.get("total_calificaciones")).longValue()).isEqualTo(calificaciones);
    }

    private void afirmarAmbas(long reportes, long resueltos, long calificaciones) {
        afirmar(null, reportes, resueltos, calificaciones);
        afirmar(categoria().getId(), reportes, resueltos, calificaciones);
    }

    @Test
    void ocultarElReporte_loSacaDelIndice_yRestablecerloLoDevuelve() throws Exception {
        afirmarAmbas(2, 1, 1);

        ocultar(admin, resuelto.getId(), "REPORTE").andExpect(status().isOk());
        // Sin refrescar a mano: lo hizo el listener despues del commit.
        afirmarAmbas(1, 0, 0);

        restablecer(admin, resuelto.getId(), "REPORTE").andExpect(status().isOk());
        afirmarAmbas(2, 1, 1);
    }

    @Test
    void ocultarSoloLaFoto_noCambiaElIndice_niLoRefresca() throws Exception {
        // Si algo refrescara la vista, calculated_at (now() del REFRESH) cambiaria.
        Timestamp antes = (Timestamp) fila(null).get("calculated_at");

        ocultar(admin, pendienteConFoto.getId(), "FOTO").andExpect(status().isOk());
        afirmarAmbas(2, 1, 1);
        assertThat(fila(null).get("calculated_at")).isEqualTo(antes);

        restablecer(admin, pendienteConFoto.getId(), "FOTO").andExpect(status().isOk());
        afirmarAmbas(2, 1, 1);
        assertThat(fila(null).get("calculated_at")).isEqualTo(antes);
    }

    @Test
    void elRankingPublicoTampocoLoCuenta() throws Exception {
        ocultar(admin, resuelto.getId(), "REPORTE").andExpect(status().isOk());
        String ranking = mockMvc.perform(get("/api/desempeno/distritos"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var filas = objectMapper.readTree(ranking);
        boolean encontrado = false;
        for (var f : filas) {
            if (f.get("distritoId").asLong() == miraflores().getId()) {
                encontrado = true;
                assertThat(f.get("totalReportes").asLong()).isEqualTo(1);
                assertThat(f.get("totalResueltos").asLong()).isEqualTo(0);
                assertThat(f.get("totalCalificaciones").asLong()).isEqualTo(0);
            }
        }
        assertThat(encontrado).isTrue();
    }

    @Test
    void laExportacionNoTraeElReporteOculto() throws Exception {
        ocultar(admin, resuelto.getId(), "REPORTE").andExpect(status().isOk());

        String csv = new String(mockMvc.perform(get("/api/reportes/exportar").param("formato", "CSV")
                        .header("Authorization", bearer(funcionario)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(csv).contains("Reporte pendiente que sigue a la vista")
                .doesNotContain("Reporte resuelto que se ocultara");

        restablecer(admin, resuelto.getId(), "REPORTE").andExpect(status().isOk());
        String despues = new String(mockMvc.perform(get("/api/reportes/exportar").param("formato", "CSV")
                        .header("Authorization", bearer(funcionario)))
                .andReturn().getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(despues).contains("Reporte resuelto que se ocultara");
    }

    @Test
    void elDashboardDelFuncionarioNoCuentaElOcultoComoEstancado() {
        jdbcTemplate.update("UPDATE reporte SET updated_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minus(30, ChronoUnit.DAYS)), pendienteConFoto.getId());
        assertThat(contarEstancados()).isEqualTo(1);
        jdbcTemplate.update("UPDATE reporte SET oculto = TRUE WHERE id = ?", pendienteConFoto.getId());
        assertThat(contarEstancados()).isZero();
    }

    private long contarEstancados() {
        return reporteRepository.countEstancados(miraflores().getId(), Instant.now().minus(7, ChronoUnit.DAYS));
    }
}
