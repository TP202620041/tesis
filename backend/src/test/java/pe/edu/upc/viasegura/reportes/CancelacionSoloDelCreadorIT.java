package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
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

/**
 * REGRESION DE SEGURIDAD: CANCELADO no es alcanzable desde el endpoint de
 * gestion municipal.
 *
 * <p>Hallazgo (2026-08-29): {@code PATCH /api/reportes/{id}/estado} validaba
 * las transiciones contra un unico conjunto que mezclaba las potestades de
 * los dos actores, y por eso aceptaba CANCELADO como destino. Un funcionario
 * podia retirar reportes de su propio distrito; como un CANCELADO queda
 * excluido de {@code total_reportes} en la vista de desempeno (V7) y no
 * aparece en la busqueda publica, el reporte desaparecia del escrutinio
 * <em>disfrazado de retiro voluntario del vecino</em>, sin el comentario
 * justificatorio que exige un RECHAZADO.</p>
 *
 * <p>Esta clase existe aparte de {@link GestionMunicipalIT} a proposito: es
 * la regresion nombrada de ese hallazgo concreto y no debe diluirse entre
 * los tests generales de la maquina de estados.</p>
 */
class CancelacionSoloDelCreadorIT extends AbstractPostgisIT {

    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

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

    private Distrito miraflores() {
        return distritoRepository.findByNombre("Miraflores").orElseThrow();
    }

    private Usuario funcionario() {
        return guardarConTerminos(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Rosa").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).distrito(miraflores()).build());
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private Reporte reporte(Usuario creador, EstadoReporte estado) {
        CategoriaDano categoria = categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(LON, LAT))
                .categoria(categoria).creador(creador).distrito(miraflores())
                .estado(estado).totalAdhesiones(1).build());
    }

    private void intentarCancelarComoFuncionario(EstadoReporte estadoInicial) throws Exception {
        Usuario func = funcionario();
        Reporte r = reporte(ciudadano(), estadoInicial);

        mockMvc.perform(patch("/api/reportes/" + r.getId() + "/estado")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"estado\":\"CANCELADO\",\"comentario\":\"lo retiro yo\"}")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isForbidden());

        // Lo que de verdad importa: el estado NO cambio en la base.
        assertThat(reporteRepository.findById(r.getId()).orElseThrow().getEstado())
                .as("el funcionario no debe poder cancelar (estado inicial %s)", estadoInicial)
                .isEqualTo(estadoInicial);
    }

    @Test
    void funcionarioNoPuedeCancelarUnReportePendiente() throws Exception {
        // El caso explotable: PENDIENTE -> CANCELADO era una transicion
        // permitida en el conjunto unico anterior.
        intentarCancelarComoFuncionario(EstadoReporte.PENDIENTE);
    }

    @Test
    void funcionarioNoPuedeCancelarDesdeNingunOtroEstado() throws Exception {
        // Se recorren todos los estados de partida, no solo el explotable:
        // el destino CANCELADO debe estar cerrado para el funcionario sea
        // cual sea el estado actual del reporte.
        intentarCancelarComoFuncionario(EstadoReporte.RECIBIDO);
        intentarCancelarComoFuncionario(EstadoReporte.EN_PROCESO);
        intentarCancelarComoFuncionario(EstadoReporte.RESUELTO);
        intentarCancelarComoFuncionario(EstadoReporte.RECHAZADO);
    }

    @Test
    void elMensajeDeErrorOrientaHaciaLaViaCorrecta() throws Exception {
        Usuario func = funcionario();
        Reporte r = reporte(ciudadano(), EstadoReporte.PENDIENTE);

        mockMvc.perform(patch("/api/reportes/" + r.getId() + "/estado")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"estado\":\"CANCELADO\"}")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isForbidden())
                // El 403 generico de "acceso denegado" no explicaria nada:
                // el funcionario SI puede gestionar este reporte, solo que
                // no por esa via.
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("RECHAZADO")));
    }

    @Test
    void elFuncionarioSiPuedeRechazar_laViaLegitimaParaDescartar() throws Exception {
        // Contraparte: cerrar CANCELADO no debe dejar al funcionario sin
        // forma de descartar un reporte. RECHAZADO sigue disponible y exige
        // justificacion.
        Usuario func = funcionario();
        Reporte r = reporte(ciudadano(), EstadoReporte.PENDIENTE);

        mockMvc.perform(patch("/api/reportes/" + r.getId() + "/estado")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"estado\":\"RECHAZADO\",\"comentario\":\"No es via publica\"}")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk());

        assertThat(reporteRepository.findById(r.getId()).orElseThrow().getEstado())
                .isEqualTo(EstadoReporte.RECHAZADO);
    }

    @Test
    void elCreadorSiPuedeCancelarSuPropioReporte_flujoDeUS08Intacto() throws Exception {
        // La via legitima no se toco: el ciudadano creador sigue pudiendo
        // retirar su reporte mientras siga PENDIENTE.
        Usuario creador = ciudadano();
        Reporte r = reporte(creador, EstadoReporte.PENDIENTE);

        mockMvc.perform(delete("/api/reportes/" + r.getId())
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado").value("CANCELADO"));

        assertThat(reporteRepository.findById(r.getId()).orElseThrow().getEstado())
                .isEqualTo(EstadoReporte.CANCELADO);
    }
}
