package pe.edu.upc.viasegura.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
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
import pe.edu.upc.viasegura.reportes.domain.Severidad;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * CORS para la PWA (Next.js), que corre en otro origen.
 *
 * <p>Sin esto, el navegador bloquea toda llamada del frontend: el preflight
 * {@code OPTIONS} viaja sin cabecera {@code Authorization} y la cadena de
 * seguridad lo rechazaba con 403 antes de que el request real saliera.</p>
 */
class CorsConfigIT extends AbstractPostgisIT {

    private static final String ORIGEN_FRONTEND = "http://localhost:3000";

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

    @Test
    void preflightDesdeElFrontend_esAceptado() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                        .header("Origin", ORIGEN_FRONTEND)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGEN_FRONTEND));
    }

    @Test
    void preflightPermiteAuthorizationEIdempotencyKey() throws Exception {
        // El Service Worker reintenta la creacion de reportes con
        // Idempotency-Key (US-06): esa cabecera debe sobrevivir al preflight.
        mockMvc.perform(options("/api/reportes")
                        .header("Origin", ORIGEN_FRONTEND)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "authorization,idempotency-key"))
                .andExpect(status().isOk())
                .andExpect(header().stringValues("Access-Control-Allow-Headers",
                        org.hamcrest.Matchers.hasItem(
                                org.hamcrest.Matchers.containsStringIgnoringCase("idempotency-key"))));
    }

    @Test
    void origenNoPermitido_esRechazado() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                        .header("Origin", "http://atacante.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }

    @Test
    void requestRealDesdeElFrontend_llevaLaCabeceraDeOrigenPermitido() throws Exception {
        // El preflight no basta: la respuesta real tambien debe traer
        // Access-Control-Allow-Origin o el navegador descarta el cuerpo.
        mockMvc.perform(post("/api/auth/login")
                        .header("Origin", ORIGEN_FRONTEND)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nadie@lima.pe\",\"password\":\"incorrecta\"}"))
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGEN_FRONTEND));
    }

    @Test
    void metodosDeLaApiEstanPermitidos() throws Exception {
        for (HttpMethod metodo : new HttpMethod[]{
                HttpMethod.GET, HttpMethod.POST, HttpMethod.PATCH, HttpMethod.DELETE}) {
            mockMvc.perform(options("/api/reportes/1")
                            .header("Origin", ORIGEN_FRONTEND)
                            .header("Access-Control-Request-Method", metodo.name()))
                    .andExpect(status().isOk());
        }
    }

    @Test
    void exportacionDesdeElFrontend_exponeContentDisposition() throws Exception {
        // US-28: el frontend corre en otro origen; sin Access-Control-Expose-Headers
        // el navegador le oculta Content-Disposition y pierde el nombre del archivo.
        Distrito miraflores = distritoRepository.findByNombre("Miraflores").orElseThrow();
        CategoriaDano categoria = categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).findFirst().orElseThrow();
        Usuario ciudadano = guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
        Usuario funcionario = guardarConTerminos(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).distrito(miraflores).build());
        reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria).creador(ciudadano).distrito(miraflores)
                .estado(EstadoReporte.PENDIENTE).totalAdhesiones(1).build());
        String token = jwtService.generarToken(funcionario.getEmail(), funcionario.getRol().name());

        mockMvc.perform(get("/api/reportes/exportar")
                        .param("formato", "CSV")
                        .header("Origin", ORIGEN_FRONTEND)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGEN_FRONTEND))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        Matchers.containsString("attachment")))
                .andExpect(header().stringValues("Access-Control-Expose-Headers",
                        Matchers.hasItem(Matchers.containsStringIgnoringCase(
                                HttpHeaders.CONTENT_DISPOSITION))));
    }
}
