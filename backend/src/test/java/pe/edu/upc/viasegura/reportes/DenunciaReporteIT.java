package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.reportes.domain.DenunciaReporte;
import pe.edu.upc.viasegura.reportes.domain.EstadoDenuncia;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.MotivoDenuncia;
import pe.edu.upc.viasegura.reportes.domain.Reporte;

/**
 * NC-11a: un CIUDADANO denuncia un reporte publico. Una vez por reporte, nunca
 * el propio, como maximo 10 en 24 h, y solo sobre reportes publicos. La
 * denuncia no oculta nada (SEC-01).
 */
class DenunciaReporteIT extends AbstractModeracionIT {

    @Autowired
    TransactionTemplate transaccion;

    private Usuario creador;
    private Usuario vecino;
    private Reporte reporte;

    @BeforeEach
    void escenario() {
        creador = ciudadano();
        vecino = ciudadano();
        reporte = reporte(creador, EstadoReporte.PENDIENTE, null);
    }

    private ResultActions denunciar(Usuario quien, Long reporteId, String cuerpo) throws Exception {
        var pedido = post("/api/reportes/{id}/denuncias", reporteId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(cuerpo);
        if (quien != null) {
            pedido.header("Authorization", bearer(quien));
        }
        return mockMvc.perform(pedido);
    }

    private ResultActions denunciar(Usuario quien, Long reporteId) throws Exception {
        return denunciar(quien, reporteId, """
                {"motivo":"OFENSIVO","detalle":"  Tiene un insulto en la descripción  "}""");
    }

    @Test
    void ciudadano_denuncia_201_ySoloConSuDenuncia() throws Exception {
        denunciar(vecino, reporte.getId())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.reporteId", is(reporte.getId().intValue())))
                .andExpect(jsonPath("$.motivo", is("OFENSIVO")))
                .andExpect(jsonPath("$.createdAt", notNullValue()))
                // Ni el conteo ni otras denuncias: solo la propia.
                .andExpect(jsonPath("$.total").doesNotExist())
                .andExpect(jsonPath("$.denuncias").doesNotExist());

        List<DenunciaReporte> guardadas = denunciaRepository.findByReporteIdOrderByCreatedAtAscIdAsc(reporte.getId());
        assertThat(guardadas).hasSize(1);
        assertThat(guardadas.get(0).getEstado()).isEqualTo(EstadoDenuncia.PENDIENTE);
        assertThat(guardadas.get(0).getDetalle()).isEqualTo("Tiene un insulto en la descripción");
        // La denuncia no oculta nada por si sola.
        Reporte releido = reporteRepository.findById(reporte.getId()).orElseThrow();
        assertThat(releido.isOculto()).isFalse();
        assertThat(releido.isFotoOculta()).isFalse();
    }

    @Test
    void sinDetalle_201() throws Exception {
        denunciar(vecino, reporte.getId(), """
                {"motivo":"FALSO"}""").andExpect(status().isCreated());
        assertThat(denunciaRepository.findByReporteIdOrderByCreatedAtAscIdAsc(reporte.getId()).get(0).getDetalle())
                .isNull();
    }

    @Test
    void repetida_409() throws Exception {
        denunciar(vecino, reporte.getId()).andExpect(status().isCreated());
        denunciar(vecino, reporte.getId(), """
                {"motivo":"FALSO"}""")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("DENUNCIA_REPETIDA")))
                .andExpect(jsonPath("$.message", is("Ya denunciaste este reporte")));
        assertThat(denunciaRepository.findByReporteIdOrderByCreatedAtAscIdAsc(reporte.getId())).hasSize(1);
    }

    @Test
    void propia_409() throws Exception {
        denunciar(creador, reporte.getId())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("DENUNCIA_PROPIA")));
        assertThat(denunciaRepository.count()).isZero();
    }

    @Test
    void limiteDiario_409_ySoloCuentanLasUltimas24h() throws Exception {
        for (int i = 0; i < 10; i++) {
            denuncia(reporte(ciudadano(), EstadoReporte.PENDIENTE, null), vecino, MotivoDenuncia.OTRO);
        }
        denunciar(vecino, reporte.getId())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("LIMITE_DENUNCIAS")))
                .andExpect(jsonPath("$.message", is("Alcanzaste el máximo de denuncias por hoy")));

        // Una de las 10 pasa a tener mas de 24 h: vuelve a haber cupo.
        jdbcTemplate.update("""
                UPDATE denuncia_reporte SET created_at = now() - interval '25 hours'
                 WHERE id = (SELECT MIN(id) FROM denuncia_reporte WHERE denunciante_id = ?)""", vecino.getId());
        denunciar(vecino, reporte.getId()).andExpect(status().isCreated());
    }

    @Test
    void reporteOculto_404() throws Exception {
        ocultar(admin(), reporte.getId(), "REPORTE").andExpect(status().isOk());
        denunciar(vecino, reporte.getId()).andExpect(status().isNotFound());
    }

    @Test
    void conSoloLaFotoOculta_sePuedeDenunciar() throws Exception {
        Reporte conFoto = reporte(creador, EstadoReporte.PENDIENTE, fotoGuardada());
        ocultar(admin(), conFoto.getId(), "FOTO").andExpect(status().isOk());
        denunciar(vecino, conFoto.getId()).andExpect(status().isCreated());
    }

    @Test
    void reporteCancelado_404() throws Exception {
        Reporte cancelado = reporte(creador, EstadoReporte.CANCELADO, null);
        denunciar(vecino, cancelado.getId()).andExpect(status().isNotFound());
    }

    @Test
    void reporteInexistente_404() throws Exception {
        denunciar(vecino, 999_999_999L).andExpect(status().isNotFound());
    }

    @Test
    void anonimo_401() throws Exception {
        denunciar(null, reporte.getId()).andExpect(status().isUnauthorized());
    }

    @Test
    void funcionario_403() throws Exception {
        denunciar(funcionario(miraflores()), reporte.getId()).andExpect(status().isForbidden());
        assertThat(denunciaRepository.count()).isZero();
    }

    @Test
    void admin_403() throws Exception {
        denunciar(admin(), reporte.getId()).andExpect(status().isForbidden());
    }

    @Test
    void motivoInvalido_400() throws Exception {
        denunciar(vecino, reporte.getId(), """
                {"motivo":"NO_ME_GUSTA"}""").andExpect(status().isBadRequest());
        denunciar(vecino, reporte.getId(), "{}").andExpect(status().isBadRequest());
        denunciar(vecino, reporte.getId(), """
                {"motivo":"OTRO","detalle":"%s"}""".formatted("x".repeat(501)))
                .andExpect(status().isBadRequest());
        assertThat(denunciaRepository.count()).isZero();
    }

    @Test
    void ganchoDeBe14_anonimizaAlDenuncianteSinBorrarLaDenuncia() throws Exception {
        denunciar(vecino, reporte.getId()).andExpect(status().isCreated());

        int filas = anonimizar(vecino);

        assertThat(filas).isEqualTo(1);
        Integer sinDenunciante = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM denuncia_reporte WHERE reporte_id = ? AND denunciante_id IS NULL",
                Integer.class, reporte.getId());
        assertThat(sinDenunciante).isEqualTo(1);
    }

    /** El metodo de BE-14 es un UPDATE: necesita una transaccion, como la tendra el cierre de cuenta. */
    private int anonimizar(Usuario u) {
        return transaccion.execute(estado -> denunciaRepository.anonimizarDenunciante(u.getId()));
    }
}
