package pe.edu.upc.viasegura.reportes;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
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

/**
 * QA-1 M-6: el ciudadano ve los reportes de otros vecinos a los que se
 * adhirio (US-09), en {@code GET /api/reportes/mis-adhesiones}. Mis-reportes
 * sigue siendo solo lo que creo ({@code MisReportesIT}).
 */
class MisAdhesionesIT extends AbstractPostgisIT {

    private static final String RUTA = "/api/reportes/mis-adhesiones";
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    DistritoRepository distritoRepository;
    @Autowired
    CategoriaDanoRepository categoriaRepository;
    @Autowired
    ReporteRepository reporteRepository;
    @Autowired
    AdhesionReporteRepository adhesionRepository;

    private Distrito miraflores() {
        return distritoRepository.findByNombre("Miraflores").orElseThrow();
    }

    private CategoriaDano categoria() {
        return categoriaRepository.findAll().stream()
                .filter(c -> c.isEsEstandar() && c.isActivo()).findFirst().orElseThrow();
    }

    private Usuario usuario(Rol rol) {
        return guardarConTerminos(Usuario.builder()
                .email("u-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(rol)
                .distrito(rol == Rol.FUNCIONARIO_MUNICIPAL ? miraflores() : null).build());
    }

    private Usuario ciudadano() {
        return usuario(Rol.CIUDADANO);
    }

    /** Reporte creado por {@code creador}, con su propia fila de adhesion (como la creacion real). */
    private Reporte reporte(Usuario creador, EstadoReporte estado) {
        Reporte r = reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(LON, LAT))
                .categoria(categoria()).creador(creador).distrito(miraflores())
                .estado(estado).totalAdhesiones(1).build());
        adherir(r, creador);
        return r;
    }

    private void adherir(Reporte r, Usuario usuario) {
        adhesionRepository.save(AdhesionReporte.builder().reporte(r).usuario(usuario).build());
    }

    private String bearer(Usuario u) {
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private ResultActions crearPorApi(Usuario u) throws Exception {
        return mockMvc.perform(multipart("/api/reportes")
                .param("latitud", String.valueOf(LAT))
                .param("longitud", String.valueOf(LON))
                .param("categoriaId", String.valueOf(categoria().getId()))
                .param("titulo", "Bache frente al parque")
                .param("severidad", "MEDIA")
                .header("Authorization", bearer(u)));
    }

    @Test
    void adherirsePorElApi_elReporteApareceEnMisAdhesionesYNoEnMisReportes() throws Exception {
        // El caso de QA-1: la confirmacion de la adhesion ofrece «Ver mis
        // reportes», pero el reporte apoyado no aparecia en ningun lado.
        Usuario creador = ciudadano();
        Usuario vecino = ciudadano();
        crearPorApi(creador).andExpect(status().isCreated());
        crearPorApi(vecino).andExpect(status().isCreated()).andExpect(jsonPath("$.esAdhesion", is(true)));
        Reporte reporte = reporteRepository.findByCreadorIdOrderByCreatedAtDesc(creador.getId()).get(0);

        mockMvc.perform(get(RUTA).header("Authorization", bearer(vecino)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id", is(reporte.getId().intValue())))
                .andExpect(jsonPath("$[0].titulo", is("Bache frente al parque")))
                .andExpect(jsonPath("$[0].totalAdhesiones", is(2)));
        mockMvc.perform(get("/api/reportes/mis-reportes").header("Authorization", bearer(vecino)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
        // Y el creador no lo ve como adhesion: es suyo.
        mockMvc.perform(get(RUTA).header("Authorization", bearer(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void ordenDelApoyoMasRecienteAlMasAntiguo_yNoIncluyeLosPropios() throws Exception {
        Usuario vecino = ciudadano();
        Usuario otro = ciudadano();
        Reporte primero = reporte(otro, EstadoReporte.PENDIENTE);
        Reporte segundo = reporte(otro, EstadoReporte.RECIBIDO);
        reporte(vecino, EstadoReporte.PENDIENTE); // propio: va en mis-reportes
        adherir(primero, vecino);
        adherir(segundo, vecino);

        mockMvc.perform(get(RUTA).header("Authorization", bearer(vecino)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id", is(segundo.getId().intValue())))
                .andExpect(jsonPath("$[0].estado", is("RECIBIDO")))
                .andExpect(jsonPath("$[1].id", is(primero.getId().intValue())));
    }

    @Test
    void incluyeCualquierEstado_tambienElCanceladoPorSuCreador() throws Exception {
        // Cancelar retira el reporte para todos (US-08): el vecino que lo
        // apoyaba tiene que poder enterarse.
        Usuario vecino = ciudadano();
        Reporte cancelado = reporte(ciudadano(), EstadoReporte.CANCELADO);
        adherir(cancelado, vecino);

        mockMvc.perform(get(RUTA).header("Authorization", bearer(vecino)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].estado", is("CANCELADO")));
    }

    @Test
    void sinAdhesiones_listaVacia() throws Exception {
        mockMvc.perform(get(RUTA).header("Authorization", bearer(ciudadano())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void sinToken_401_yFuncionario_403() throws Exception {
        mockMvc.perform(get(RUTA)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(RUTA).header("Authorization", bearer(usuario(Rol.FUNCIONARIO_MUNICIPAL))))
                .andExpect(status().isForbidden());
    }
}
