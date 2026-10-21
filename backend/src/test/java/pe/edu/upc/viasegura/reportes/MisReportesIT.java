package pe.edu.upc.viasegura.reportes;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
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
import pe.edu.upc.viasegura.reportes.domain.AdhesionReporte;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.AdhesionReporteRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Reportes que el ciudadano ha enviado, con su estado (US-07). */
class MisReportesIT extends AbstractPostgisIT {

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
    AdhesionReporteRepository adhesionRepository;

    private Distrito distrito() {
        return distritoRepository.findByNombre("Miraflores")
                .orElseThrow(() -> new IllegalStateException("Falta distrito Miraflores"));
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

    private Reporte reporte(Usuario creador, EstadoReporte estado) {
        return reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria()).creador(creador).distrito(distrito())
                .estado(estado).totalAdhesiones(1).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    @Test
    void ciudadanoConReportes_veSusPropiosReportes_masRecientePrimero() throws Exception {
        Usuario creador = ciudadano();
        Reporte r1 = reporte(creador, EstadoReporte.PENDIENTE);
        Reporte r2 = reporte(creador, EstadoReporte.EN_PROCESO);

        mockMvc.perform(get("/api/reportes/mis-reportes")
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id", is(r2.getId().intValue())))
                .andExpect(jsonPath("$[0].estado", is("EN_PROCESO")))
                .andExpect(jsonPath("$[0].distritoNombre", is("Miraflores")))
                .andExpect(jsonPath("$[1].id", is(r1.getId().intValue())))
                .andExpect(jsonPath("$[1].estado", is("PENDIENTE")));
    }

    @Test
    void ciudadanoSinReportes_recibeListaVacia() throws Exception {
        Usuario ciudadano = ciudadano();

        mockMvc.perform(get("/api/reportes/mis-reportes")
                        .header("Authorization", "Bearer " + token(ciudadano)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void reporteDondeSoloEsAdherido_noApareceEnMisReportes() throws Exception {
        // Decision explicita US-07: "reportes que he enviado" = solo CREADOR,
        // a diferencia de US-22 (historial) donde el adherido si tiene acceso.
        Usuario creador = ciudadano();
        Usuario adherido = ciudadano();
        Reporte reporte = reporte(creador, EstadoReporte.PENDIENTE);
        adhesionRepository.save(AdhesionReporte.builder()
                .reporte(reporte).usuario(adherido).build());

        mockMvc.perform(get("/api/reportes/mis-reportes")
                        .header("Authorization", "Bearer " + token(adherido)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void sinToken_401() throws Exception {
        mockMvc.perform(get("/api/reportes/mis-reportes"))
                .andExpect(status().isUnauthorized());
    }
}
