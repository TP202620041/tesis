package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.reportes.domain.DenunciaReporte;
import pe.edu.upc.viasegura.reportes.domain.EstadoDenuncia;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.MotivoDenuncia;
import pe.edu.upc.viasegura.reportes.domain.Reporte;

/**
 * NC-11a (D-15): el ADMIN oculta un reporte o su foto, y lo restablece.
 *
 * <p>Recorre la tabla de visibilidad de la ficha: con el reporte oculto, solo
 * lo ven su creador y el ADMIN (el funcionario y los adheridos reciben 404 en
 * el historial; el funcionario, tambien en el responsable y el estado); con
 * solo la foto oculta, el reporte sigue publico sin {@code fotoUrl}. Despues
 * de restablecer, todo vuelve a como era. Solo el ADMIN modera (SEC-01).</p>
 */
class OcultamientoReporteIT extends AbstractModeracionIT {

    private static final String ADHERIDO_OCULTA = "Se ocultó contenido de este reporte por las reglas de uso.";
    private static final String ADHERIDO_RESTABLECIDA = "Se restableció contenido de este reporte.";
    private static final String AUTOR_MODERACION = "Moderación de Ciudad Viva";
    private static final String AVISO_OCULTO =
            "Mientras esté oculto, este reporte no cuenta en el índice de desempeño.";
    private static final String AVISO_RESTABLECIDO = "Vuelve a contar en el índice de desempeño.";

    private Usuario admin;
    private Usuario creador;
    private Usuario adherido;
    private Usuario ajeno;
    private Usuario funcionario;
    private Usuario funcionarioSurco;
    private Usuario denunciante;
    private Reporte reporte;
    private String fotoUrl;

    @BeforeEach
    void escenario() {
        admin = admin();
        creador = ciudadano();
        adherido = ciudadano();
        ajeno = ciudadano();
        denunciante = ciudadano();
        funcionario = funcionario(miraflores());
        funcionarioSurco = funcionario(distrito("Santiago de Surco"));
        fotoUrl = fotoGuardada();
        reporte = reporte(creador, EstadoReporte.RECIBIDO, fotoUrl);
        adherir(reporte, adherido);
    }

    private ResultActions historial(Usuario u) throws Exception {
        return mockMvc.perform(get("/api/reportes/{id}/historial", reporte.getId())
                .header("Authorization", bearer(u)));
    }

    private ResultActions bandejaMunicipal() throws Exception {
        return mockMvc.perform(get("/api/reportes/bandeja").header("Authorization", bearer(funcionario)));
    }

    private ResultActions cambiarEstado(Usuario u) throws Exception {
        return mockMvc.perform(patch("/api/reportes/{id}/estado", reporte.getId())
                .header("Authorization", bearer(u))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"estado\":\"EN_PROCESO\",\"comentario\":\"Cuadrilla en camino\"}"));
    }

    private ResultActions asignar(Usuario u) throws Exception {
        return mockMvc.perform(post("/api/reportes/{id}/responsable", reporte.getId())
                .header("Authorization", bearer(u))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"responsable\":\"Cuadrilla Norte\"}"));
    }

    private ResultActions responsable(Usuario u) throws Exception {
        return mockMvc.perform(get("/api/reportes/{id}/responsable", reporte.getId())
                .header("Authorization", bearer(u)));
    }

    // ------------------------------------------------------------------
    // Reporte oculto
    // ------------------------------------------------------------------

    @Test
    void reporteOculto_saleDeLoPublico() throws Exception {
        ocultar(admin, reporte.getId(), "REPORTE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.oculto", is(true)))
                .andExpect(jsonPath("$.fotoOculta", is(false)))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store, private"));

        mockMvc.perform(get("/api/reportes/{id}", reporte.getId())).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/reportes/{id}/comentarios", reporte.getId())).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/reportes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", empty()));
        mockMvc.perform(get("/api/reportes")
                        .param("minLat", "-12.2").param("minLon", "-77.1")
                        .param("maxLat", "-12.0").param("maxLon", "-76.9"))
                .andExpect(jsonPath("$.content", empty()));
        mockMvc.perform(get("/api/reportes/densidad"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReportes", is(0)));
        // La foto del reporte oculto tampoco se sirve.
        mockMvc.perform(get(fotoUrl)).andExpect(status().isNotFound());
    }

    @Test
    void reporteOculto_noSePuedeComentar_404() throws Exception {
        Reporte resuelto = reporte(creador, EstadoReporte.RESUELTO, null);
        ocultar(admin, resuelto.getId(), "REPORTE").andExpect(status().isOk());
        mockMvc.perform(post("/api/reportes/{id}/comentarios", resuelto.getId())
                        .header("Authorization", bearer(ajeno))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contenido\":\"Quedó bien reparado\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void reporteOculto_salDeMisAdhesiones_peroSigueEnMisReportesDelCreador_sinFoto() throws Exception {
        mockMvc.perform(get("/api/reportes/mis-adhesiones").header("Authorization", bearer(adherido)))
                .andExpect(jsonPath("$[*].id", hasItem(reporte.getId().intValue())));

        ocultar(admin, reporte.getId(), "REPORTE").andExpect(status().isOk());

        mockMvc.perform(get("/api/reportes/mis-adhesiones").header("Authorization", bearer(adherido)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", empty()));
        mockMvc.perform(get("/api/reportes/mis-reportes").header("Authorization", bearer(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", contains(reporte.getId().intValue())))
                .andExpect(jsonPath("$[0].fotoUrl", nullValue()));
    }

    @Test
    void reporteOculto_saleDeLaBandejaYDeSuGestion_404AlFuncionarioDelDistrito() throws Exception {
        bandejaMunicipal().andExpect(jsonPath("$[*].id", hasItem(reporte.getId().intValue())));

        ocultar(admin, reporte.getId(), "REPORTE").andExpect(status().isOk());

        bandejaMunicipal().andExpect(status().isOk()).andExpect(jsonPath("$", empty()));
        cambiarEstado(funcionario).andExpect(status().isNotFound());
        asignar(funcionario).andExpect(status().isNotFound());
        responsable(funcionario).andExpect(status().isNotFound());
        // El de otro distrito sigue recibiendo el 403 de siempre.
        cambiarEstado(funcionarioSurco).andExpect(status().isForbidden());
        // Nada cambio en el reporte.
        assertThat(reporteRepository.findById(reporte.getId()).orElseThrow().getEstado())
                .isEqualTo(EstadoReporte.RECIBIDO);
    }

    @Test
    void reporteOculto_historial_soloCreadorYAdmin() throws Exception {
        ocultar(admin, reporte.getId(), "REPORTE").andExpect(status().isOk());

        historial(creador)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].tipoEvento", is("REPORTE_OCULTO")))
                .andExpect(jsonPath("$[0].estadoAnterior", nullValue()))
                .andExpect(jsonPath("$[0].estadoNuevo", nullValue()))
                .andExpect(jsonPath("$[0].comentario", is(MOTIVO)))
                .andExpect(jsonPath("$[0].avisoIndice", is(AVISO_OCULTO)))
                .andExpect(jsonPath("$[0].autor", is(AUTOR_MODERACION)));
        historial(admin)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].comentario", is(MOTIVO)))
                .andExpect(jsonPath("$[0].avisoIndice", is(AVISO_OCULTO)))
                .andExpect(jsonPath("$[0].autor", is("Nombre admin")));

        historial(funcionario).andExpect(status().isNotFound());
        historial(adherido).andExpect(status().isNotFound());
        // Los demas, el 403 de siempre.
        historial(ajeno).andExpect(status().isForbidden());
        historial(funcionarioSurco).andExpect(status().isForbidden());
    }

    @Test
    void restablecerElReporte_todoVuelveAComoEra() throws Exception {
        ocultar(admin, reporte.getId(), "REPORTE").andExpect(status().isOk());
        restablecer(admin, reporte.getId(), "REPORTE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.oculto", is(false)));

        mockMvc.perform(get("/api/reportes/{id}", reporte.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fotoUrl", is(fotoUrl)));
        mockMvc.perform(get("/api/reportes/{id}/comentarios", reporte.getId())).andExpect(status().isOk());
        mockMvc.perform(get("/api/reportes"))
                .andExpect(jsonPath("$.content[*].id", contains(reporte.getId().intValue())));
        mockMvc.perform(get(fotoUrl)).andExpect(status().isOk());
        mockMvc.perform(get("/api/reportes/mis-adhesiones").header("Authorization", bearer(adherido)))
                .andExpect(jsonPath("$[*].id", contains(reporte.getId().intValue())));
        bandejaMunicipal().andExpect(jsonPath("$[*].id", contains(reporte.getId().intValue())));
        responsable(funcionario).andExpect(status().isNoContent());
        asignar(funcionario).andExpect(status().isCreated());
        cambiarEstado(funcionario).andExpect(status().isOk());

        // La linea de tiempo muestra el par, segun quien la pide.
        historial(funcionario)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].tipoEvento", is("REPORTE_OCULTO")))
                .andExpect(jsonPath("$[0].comentario", is(MOTIVO)))
                .andExpect(jsonPath("$[0].autor", is(AUTOR_MODERACION)))
                .andExpect(jsonPath("$[0].avisoIndice", is(AVISO_OCULTO)))
                .andExpect(jsonPath("$[1].tipoEvento", is("REPORTE_RESTABLECIDO")))
                .andExpect(jsonPath("$[1].comentario", is("Revisado: el contenido cumple las reglas")))
                .andExpect(jsonPath("$[1].avisoIndice", is(AVISO_RESTABLECIDO)));
        historial(adherido)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].comentario", is(ADHERIDO_OCULTA)))
                .andExpect(jsonPath("$[0].autor", is(AUTOR_MODERACION)))
                .andExpect(jsonPath("$[0].avisoIndice", is(AVISO_OCULTO)))
                .andExpect(jsonPath("$[1].comentario", is(ADHERIDO_RESTABLECIDA)))
                .andExpect(jsonPath("$[1].avisoIndice", is(AVISO_RESTABLECIDO)));
        historial(creador)
                .andExpect(jsonPath("$[0].comentario", is(MOTIVO)))
                .andExpect(jsonPath("$[1].comentario", is("Revisado: el contenido cumple las reglas")));
    }

    // ------------------------------------------------------------------
    // Solo la foto
    // ------------------------------------------------------------------

    @Test
    void fotoOculta_elReporteSigueVisibleSinFotoUrl_yLaUrlDa404() throws Exception {
        mockMvc.perform(get(fotoUrl)).andExpect(status().isOk());

        ocultar(admin, reporte.getId(), "FOTO")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.oculto", is(false)))
                .andExpect(jsonPath("$.fotoOculta", is(true)))
                .andExpect(jsonPath("$.tieneFoto", is(true)));

        mockMvc.perform(get(fotoUrl)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/reportes/{id}", reporte.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fotoUrl", nullValue()));
        mockMvc.perform(get("/api/reportes"))
                .andExpect(jsonPath("$.content[0].id", is(reporte.getId().intValue())))
                .andExpect(jsonPath("$.content[0].fotoUrl", nullValue()));
        mockMvc.perform(get("/api/reportes/mis-reportes").header("Authorization", bearer(creador)))
                .andExpect(jsonPath("$[0].fotoUrl", nullValue()));
        bandejaMunicipal()
                .andExpect(jsonPath("$[0].id", is(reporte.getId().intValue())))
                .andExpect(jsonPath("$[0].fotoUrl", nullValue()));
        // El ADMIN la sigue viendo, por su ruta y sin cache.
        mockMvc.perform(get("/api/admin/moderacion/reportes/{id}/foto", reporte.getId())
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store, private"));

        restablecer(admin, reporte.getId(), "FOTO").andExpect(status().isOk());
        mockMvc.perform(get(fotoUrl)).andExpect(status().isOk());
        mockMvc.perform(get("/api/reportes/{id}", reporte.getId())).andExpect(jsonPath("$.fotoUrl", is(fotoUrl)));
    }

    @Test
    void fotoOculta_historialComoHoy_conElMotivoOElTextoFijo() throws Exception {
        ocultar(admin, reporte.getId(), "FOTO").andExpect(status().isOk());

        historial(creador)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].tipoEvento", is("FOTO_OCULTA")))
                .andExpect(jsonPath("$[0].comentario", is(MOTIVO)))
                .andExpect(jsonPath("$[0].autor", is(AUTOR_MODERACION)))
                .andExpect(jsonPath("$[0].avisoIndice", nullValue()));
        historial(funcionario)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].comentario", is(MOTIVO)))
                .andExpect(jsonPath("$[0].autor", is(AUTOR_MODERACION)));
        historial(adherido)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].comentario", is(ADHERIDO_OCULTA)))
                .andExpect(jsonPath("$[0].avisoIndice", nullValue()));
        historial(admin).andExpect(jsonPath("$[0].autor", is("Nombre admin")));
        historial(ajeno).andExpect(status().isForbidden());
        // Y la gestion sigue como siempre.
        cambiarEstado(funcionario).andExpect(status().isOk());
    }

    @Test
    void media_404ParaUnaFotoQueNoEsDeNingunReporte() throws Exception {
        String huerfana = fotoGuardada();
        mockMvc.perform(get(huerfana)).andExpect(status().isNotFound());
        mockMvc.perform(get(fotoUrl)).andExpect(status().isOk());
    }

    // ------------------------------------------------------------------
    // Reglas de las acciones
    // ------------------------------------------------------------------

    @Test
    void ocultarDosVeces_409_yRestablecerLoNoOculto_409() throws Exception {
        restablecer(admin, reporte.getId(), "REPORTE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("NO_OCULTO")));
        ocultar(admin, reporte.getId(), "REPORTE").andExpect(status().isOk());
        ocultar(admin, reporte.getId(), "REPORTE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("YA_OCULTO")));
        ocultar(admin, reporte.getId(), "FOTO").andExpect(status().isOk());
        ocultar(admin, reporte.getId(), "FOTO")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("YA_OCULTO")));
        Integer entradas = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM historial_estado_reporte WHERE reporte_id = ?", Integer.class, reporte.getId());
        assertThat(entradas).isEqualTo(2);
    }

    @Test
    void ocultarLaFotoDeUnReporteSinFoto_409() throws Exception {
        Reporte sinFoto = reporte(creador, EstadoReporte.PENDIENTE, null);
        ocultar(admin, sinFoto.getId(), "FOTO")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.codigo", is("SIN_FOTO")));
    }

    @Test
    void motivoFueraDeRango_400() throws Exception {
        moderar(admin, reporte.getId(), "ocultamiento", "REPORTE", "   corto   ").andExpect(status().isBadRequest());
        moderar(admin, reporte.getId(), "ocultamiento", "REPORTE", "x".repeat(501)).andExpect(status().isBadRequest());
        moderar(admin, reporte.getId(), "ocultamiento", "TODO", MOTIVO).andExpect(status().isBadRequest());
        assertThat(reporteRepository.findById(reporte.getId()).orElseThrow().isOculto()).isFalse();
    }

    @Test
    void reporteInexistente_404() throws Exception {
        ocultar(admin, 999_999_999L, "REPORTE").andExpect(status().isNotFound());
        mockMvc.perform(get("/api/admin/moderacion/reportes/{id}", 999_999_999L)
                .header("Authorization", bearer(admin))).andExpect(status().isNotFound());
    }

    @Test
    void soloElAdmin_403ParaCiudadanoYFuncionario_401SinToken() throws Exception {
        for (Usuario u : List.of(creador, ajeno, funcionario)) {
            ocultar(u, reporte.getId(), "REPORTE").andExpect(status().isForbidden());
            restablecer(u, reporte.getId(), "REPORTE").andExpect(status().isForbidden());
            mockMvc.perform(post("/api/admin/moderacion/reportes/{id}/desestimacion", reporte.getId())
                    .header("Authorization", bearer(u))).andExpect(status().isForbidden());
            mockMvc.perform(get("/api/admin/moderacion/reportes").header("Authorization", bearer(u)))
                    .andExpect(status().isForbidden());
            mockMvc.perform(get("/api/admin/moderacion/reportes/{id}", reporte.getId())
                    .header("Authorization", bearer(u))).andExpect(status().isForbidden());
            mockMvc.perform(get("/api/admin/moderacion/reportes/{id}/foto", reporte.getId())
                    .header("Authorization", bearer(u))).andExpect(status().isForbidden());
        }
        mockMvc.perform(get("/api/admin/moderacion/reportes")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/moderacion/reportes/{id}/foto", reporte.getId()))
                .andExpect(status().isUnauthorized());
        Reporte releido = reporteRepository.findById(reporte.getId()).orElseThrow();
        assertThat(releido.isOculto()).isFalse();
        assertThat(releido.isFotoOculta()).isFalse();
    }

    // ------------------------------------------------------------------
    // Denuncias y el motivo
    // ------------------------------------------------------------------

    @Test
    void motivoConElCorreoDeUnDenunciante_400_sinOcultarNada() throws Exception {
        denuncia(reporte, denunciante, MotivoDenuncia.DATOS_PERSONALES);

        moderar(admin, reporte.getId(), "ocultamiento", "FOTO",
                "Lo pidió " + denunciante.getEmail().toUpperCase() + " por datos personales")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.codigo", is("MOTIVO_IDENTIFICA_DENUNCIANTE")))
                .andExpect(jsonPath("$.details", contains("motivo")));

        Reporte releido = reporteRepository.findById(reporte.getId()).orElseThrow();
        assertThat(releido.isFotoOculta()).isFalse();
        assertThat(denunciaRepository.findByReporteIdOrderByCreatedAtAscIdAsc(reporte.getId()).get(0).getEstado())
                .isEqualTo(EstadoDenuncia.PENDIENTE);
    }

    @Test
    void ocultar_atiendeLasDenunciasPendientes_yNadaDeEllasLlegaAlCreadorNiAlFuncionario() throws Exception {
        denuncia(reporte, denunciante, MotivoDenuncia.DATOS_PERSONALES);
        denuncia(reporte, ajeno, MotivoDenuncia.OFENSIVO);

        ocultar(admin, reporte.getId(), "FOTO")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.denuncias", hasSize(2)))
                .andExpect(jsonPath("$.denuncias[*].estado", contains("ATENDIDA", "ATENDIDA")))
                .andExpect(jsonPath("$.denuncias[0].denuncianteEmail", is(denunciante.getEmail())))
                .andExpect(jsonPath("$.denuncias[0].motivoResolucion", is(MOTIVO)));

        for (DenunciaReporte d : denunciaRepository.findByReporteIdOrderByCreatedAtAscIdAsc(reporte.getId())) {
            assertThat(d.getEstado()).isEqualTo(EstadoDenuncia.ATENDIDA);
            assertThat(d.getResueltaEn()).isNotNull();
        }

        // Lo que leen el creador, el funcionario y el publico: sin denuncias.
        for (String cuerpo : List.of(
                historial(creador).andReturn().getResponse().getContentAsString(),
                historial(funcionario).andReturn().getResponse().getContentAsString(),
                historial(adherido).andReturn().getResponse().getContentAsString(),
                bandejaMunicipal().andReturn().getResponse().getContentAsString(),
                mockMvc.perform(get("/api/reportes/mis-reportes").header("Authorization", bearer(creador)))
                        .andReturn().getResponse().getContentAsString(),
                mockMvc.perform(get("/api/reportes/{id}", reporte.getId()))
                        .andReturn().getResponse().getContentAsString())) {
            assertThat(cuerpo)
                    .doesNotContainIgnoringCase("denuncia")
                    .doesNotContain(denunciante.getEmail())
                    .doesNotContain(ajeno.getEmail());
        }
    }

    @Test
    void bandejaDelAdmin_ordenadaPorCantidad_conElConteoPorMotivo_yDesestimar() throws Exception {
        Reporte otro = reporte(ciudadano(), EstadoReporte.PENDIENTE, null);
        denuncia(otro, denunciante, MotivoDenuncia.FALSO);
        denuncia(reporte, denunciante, MotivoDenuncia.OFENSIVO);
        denuncia(reporte, ajeno, MotivoDenuncia.OFENSIVO);
        denuncia(reporte, adherido, MotivoDenuncia.CONTENIDO_SEXUAL);

        mockMvc.perform(get("/api/admin/moderacion/reportes").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store, private"))
                .andExpect(jsonPath("$.totalElements", is(2)))
                .andExpect(jsonPath("$.content[0].reporteId", is(reporte.getId().intValue())))
                .andExpect(jsonPath("$.content[0].totalDenuncias", is(3)))
                .andExpect(jsonPath("$.content[0].porMotivo.OFENSIVO", is(2)))
                .andExpect(jsonPath("$.content[0].porMotivo.CONTENIDO_SEXUAL", is(1)))
                .andExpect(jsonPath("$.content[0].tieneFoto", is(true)))
                .andExpect(jsonPath("$.content[1].reporteId", is(otro.getId().intValue())))
                .andExpect(jsonPath("$.content[1].totalDenuncias", is(1)));

        mockMvc.perform(get("/api/admin/moderacion/reportes/{id}", reporte.getId())
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.denuncias", hasSize(3)))
                .andExpect(jsonPath("$.denuncias[0].denuncianteId", is(denunciante.getId().intValue())))
                .andExpect(jsonPath("$.denuncias[0].motivo", is("OFENSIVO")));

        mockMvc.perform(post("/api/admin/moderacion/reportes/{id}/desestimacion", reporte.getId())
                        .header("Authorization", bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"motivo\":\"El reporte describe un daño real\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.oculto", is(false)))
                .andExpect(jsonPath("$.denuncias[*].estado", contains("DESESTIMADA", "DESESTIMADA", "DESESTIMADA")))
                .andExpect(jsonPath("$.denuncias[0].motivoResolucion", is("El reporte describe un daño real")));

        mockMvc.perform(get("/api/admin/moderacion/reportes").header("Authorization", bearer(admin)))
                .andExpect(jsonPath("$.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].reporteId", is(otro.getId().intValue())));
        mockMvc.perform(get("/api/admin/moderacion/reportes").param("estado", "DESESTIMADA")
                        .header("Authorization", bearer(admin)))
                .andExpect(jsonPath("$.content[*].reporteId", contains(reporte.getId().intValue())));
        // Sin cuerpo tambien se puede desestimar (y repetirlo no falla).
        mockMvc.perform(post("/api/admin/moderacion/reportes/{id}/desestimacion", otro.getId())
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.denuncias[0].estado", is("DESESTIMADA")))
                .andExpect(jsonPath("$.denuncias[0].motivoResolucion", nullValue()));
        mockMvc.perform(get("/api/admin/moderacion/reportes").header("Authorization", bearer(admin)))
                .andExpect(jsonPath("$.content", empty()));
    }

    /**
     * NC-11a2: con {@code ocultos=true} la bandeja lista lo oculto (reporte o
     * foto), tenga denuncias o no, lo ocultado mas recientemente primero, con
     * todas las denuncias del reporte en cualquier estado e ignorando
     * {@code estado}. Con {@code ocultos=false} todo sigue como antes.
     */
    @Test
    void bandejaDelAdmin_ocultos_listaLoOcultoConODenuncias_loMasRecientePrimero() throws Exception {
        // `reporte` queda visible y con dos denuncias pendientes: nunca entra en la vista de ocultos.
        denuncia(reporte, denunciante, MotivoDenuncia.OFENSIVO);
        denuncia(reporte, ajeno, MotivoDenuncia.OFENSIVO);
        Reporte sinDenuncias = reporte(ciudadano(), EstadoReporte.PENDIENTE, null);
        Reporte soloFoto = reporte(ciudadano(), EstadoReporte.RECIBIDO, fotoGuardada());
        Reporte conDenuncias = reporte(ciudadano(), EstadoReporte.EN_PROCESO, null);
        denuncia(conDenuncias, denunciante, MotivoDenuncia.FALSO);
        denuncia(conDenuncias, ajeno, MotivoDenuncia.DATOS_PERSONALES);

        // Se ocultan en un orden distinto al de creacion para que el orden no salga del id.
        ocultar(admin, conDenuncias.getId(), "REPORTE").andExpect(status().isOk());
        ocultar(admin, sinDenuncias.getId(), "REPORTE").andExpect(status().isOk());
        ocultar(admin, soloFoto.getId(), "FOTO").andExpect(status().isOk());
        // Una denuncia mas, pendiente, sobre el ya oculto: en la vista de ocultos cuentan todas.
        denuncia(conDenuncias, adherido, MotivoDenuncia.FALSO);

        mockMvc.perform(get("/api/admin/moderacion/reportes").param("ocultos", "true")
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store, private"))
                .andExpect(jsonPath("$.totalElements", is(3)))
                .andExpect(jsonPath("$.content[*].reporteId", contains(
                        soloFoto.getId().intValue(), sinDenuncias.getId().intValue(), conDenuncias.getId().intValue())))
                .andExpect(jsonPath("$.content[0].oculto", is(false)))
                .andExpect(jsonPath("$.content[0].fotoOculta", is(true)))
                .andExpect(jsonPath("$.content[0].tieneFoto", is(true)))
                .andExpect(jsonPath("$.content[0].totalDenuncias", is(0)))
                .andExpect(jsonPath("$.content[1].oculto", is(true)))
                .andExpect(jsonPath("$.content[1].totalDenuncias", is(0)))
                .andExpect(jsonPath("$.content[1].porMotivo").isEmpty())
                .andExpect(jsonPath("$.content[1].primeraDenuncia", nullValue()))
                .andExpect(jsonPath("$.content[1].ultimaDenuncia", nullValue()))
                .andExpect(jsonPath("$.content[2].oculto", is(true)))
                .andExpect(jsonPath("$.content[2].estado", is("EN_PROCESO")))
                .andExpect(jsonPath("$.content[2].totalDenuncias", is(3)))
                .andExpect(jsonPath("$.content[2].porMotivo.FALSO", is(2)))
                .andExpect(jsonPath("$.content[2].porMotivo.DATOS_PERSONALES", is(1)))
                .andExpect(jsonPath("$.content[2].primeraDenuncia", not(nullValue())))
                .andExpect(jsonPath("$.content[2].ultimaDenuncia", not(nullValue())));

        // `estado` se ignora con ocultos=true.
        mockMvc.perform(get("/api/admin/moderacion/reportes").param("ocultos", "true").param("estado", "DESESTIMADA")
                        .header("Authorization", bearer(admin)))
                .andExpect(jsonPath("$.totalElements", is(3)));

        // Sin el parametro (o en false) sigue siendo la bandeja de denuncias en el estado pedido:
        // las dos pendientes de `reporte` y la pendiente del oculto; el resumen cuenta solo ese estado.
        for (String ocultos : new String[] {null, "false"}) {
            MockHttpServletRequestBuilder peticion = get("/api/admin/moderacion/reportes")
                    .header("Authorization", bearer(admin));
            if (ocultos != null) {
                peticion.param("ocultos", ocultos);
            }
            mockMvc.perform(peticion)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content[*].reporteId", contains(
                            reporte.getId().intValue(), conDenuncias.getId().intValue())))
                    .andExpect(jsonPath("$.content[0].totalDenuncias", is(2)))
                    .andExpect(jsonPath("$.content[1].totalDenuncias", is(1)));
        }

        // Restablecer la foto lo saca de la vista de ocultos.
        restablecer(admin, soloFoto.getId(), "FOTO").andExpect(status().isOk());
        mockMvc.perform(get("/api/admin/moderacion/reportes").param("ocultos", "true")
                        .header("Authorization", bearer(admin)))
                .andExpect(jsonPath("$.content[*].reporteId", contains(
                        sinDenuncias.getId().intValue(), conDenuncias.getId().intValue())));

        // Solo el ADMIN.
        mockMvc.perform(get("/api/admin/moderacion/reportes").param("ocultos", "true")
                        .header("Authorization", bearer(funcionario)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/moderacion/reportes").param("ocultos", "true")
                        .header("Authorization", bearer(creador)))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------
    // Deduplicacion (US-09)
    // ------------------------------------------------------------------

    @Test
    void laDeduplicacionIgnoraLosReportesOcultos() throws Exception {
        Reporte pendiente = reporte(creador, EstadoReporte.PENDIENTE, null);
        ocultar(admin, pendiente.getId(), "REPORTE").andExpect(status().isOk());
        ocultar(admin, reporte.getId(), "REPORTE").andExpect(status().isOk());

        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", String.valueOf(LAT)).param("longitud", String.valueOf(LON))
                        .param("titulo", "Bache nuevo en el mismo sitio").param("severidad", "ALTA")
                        .param("categoriaId", String.valueOf(categoria().getId()))
                        .header("Authorization", bearer(ajeno)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(false)))
                .andExpect(jsonPath("$.id", not(is(pendiente.getId().intValue()))));
    }

    @Test
    void conSoloLaFotoOculta_laDeduplicacionSigueIgual() throws Exception {
        Reporte pendiente = reporte(creador, EstadoReporte.PENDIENTE, fotoGuardada());
        // El del escenario (tambien activo y en el mismo punto) queda fuera.
        ocultar(admin, reporte.getId(), "REPORTE").andExpect(status().isOk());
        ocultar(admin, pendiente.getId(), "FOTO").andExpect(status().isOk());

        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", String.valueOf(LAT)).param("longitud", String.valueOf(LON))
                        .param("titulo", "Bache en el mismo sitio").param("severidad", "ALTA")
                        .param("categoriaId", String.valueOf(categoria().getId()))
                        .header("Authorization", bearer(ajeno)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esAdhesion", is(true)))
                .andExpect(jsonPath("$.id", is(pendiente.getId().intValue())))
                .andExpect(jsonPath("$.fotoUrl", nullValue()));
    }

    @Test
    void elMotivoSeGuardaSinLosEspaciosDelBorde() throws Exception {
        moderar(admin, reporte.getId(), "ocultamiento", "FOTO", "   " + MOTIVO + "   ").andExpect(status().isOk());
        historial(creador).andExpect(jsonPath("$[0].comentario", is(MOTIVO)))
                .andExpect(jsonPath("$[0].comentario", containsString("placa")));
    }
}
