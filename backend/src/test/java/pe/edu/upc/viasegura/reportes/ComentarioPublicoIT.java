package pe.edu.upc.viasegura.reportes;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

/** Comentarios publicos sobre reportes resueltos (US-27). */
class ComentarioPublicoIT extends AbstractPostgisIT {

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

    private Reporte reporte(Distrito distrito, EstadoReporte estado, Usuario creador) {
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria()).creador(creador).distrito(distrito)
                .estado(estado).totalAdhesiones(1).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private String cuerpo(String contenido) {
        return "{\"contenido\":\"%s\"}".formatted(contenido);
    }

    @Test
    void comentarioValido_sePublicaYEsVisibleSinToken() throws Exception {
        Usuario creador = ciudadano();
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RESUELTO, creador);

        mockMvc.perform(post("/api/reportes/{id}/comentarios", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("Quedo muy bien reparado, gracias"))
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isCreated());

        // Lectura publica: sin token.
        mockMvc.perform(get("/api/reportes/{id}/comentarios", reporte.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].contenido", is("Quedo muy bien reparado, gracias")))
                .andExpect(jsonPath("$[0].autor", is("Ana")))
                // Solo el nombre del autor: ni correo ni apellido.
                .andExpect(jsonPath("$[0].email").doesNotExist());
    }

    @Test
    void comentarioConReincidencia_marcaReporte_visibleEnBandeja() throws Exception {
        Usuario ciudadano = ciudadano();
        Usuario func = funcionario(distrito("Miraflores"));
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RESUELTO, ciudadano);

        mockMvc.perform(post("/api/reportes/{id}/comentarios", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("El bache reaparecio, volvio a salir igual que antes"))
                        .header("Authorization", "Bearer " + token(ciudadano)))
                .andExpect(status().isCreated());

        // El funcionario ve el reporte marcado en su bandeja (US-13).
        mockMvc.perform(get("/api/reportes/bandeja")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == %d)].posibleReincidencia".formatted(reporte.getId()),
                        org.hamcrest.Matchers.contains(true)));
    }

    @Test
    void comentarioSinReincidencia_noMarcaElReporte() throws Exception {
        Usuario ciudadano = ciudadano();
        Usuario func = funcionario(distrito("Miraflores"));
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RESUELTO, ciudadano);

        mockMvc.perform(post("/api/reportes/{id}/comentarios", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("Excelente, quedo impecable"))
                        .header("Authorization", "Bearer " + token(ciudadano)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/reportes/bandeja")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == %d)].posibleReincidencia".formatted(reporte.getId()),
                        org.hamcrest.Matchers.contains(false)));
    }

    @Test
    void cualquierCiudadanoNoCreador_puedeComentar_201() throws Exception {
        // Asimetria intencional vs US-26 (calificar es solo del creador):
        // comentar es opinion publica abierta a cualquier ciudadano.
        Usuario creador = ciudadano();
        Usuario otro = ciudadano();
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RESUELTO, creador);

        mockMvc.perform(post("/api/reportes/{id}/comentarios", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("Paso por aca y confirmo que esta arreglado"))
                        .header("Authorization", "Bearer " + token(otro)))
                .andExpect(status().isCreated());
    }

    @Test
    void comentarEnReporteNoResuelto_409() throws Exception {
        Usuario ciudadano = ciudadano();
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.EN_PROCESO, ciudadano);

        mockMvc.perform(post("/api/reportes/{id}/comentarios", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("Se puede comentar?"))
                        .header("Authorization", "Bearer " + token(ciudadano)))
                .andExpect(status().isConflict());
    }

    @Test
    void elFlagDeReincidenciaNoSeExponeEnLaApiPublica() throws Exception {
        // El flag dirige la atención de la municipalidad (resalta el reporte
        // en la bandeja): publicarlo dejaría sondear qué redacciones lo
        // disparan y, con eso, manipular en qué se fija el municipio.
        Usuario ciudadano = ciudadano();
        Usuario func = funcionario(distrito("Miraflores"));
        Reporte reporte = reporte(distrito("Miraflores"), EstadoReporte.RESUELTO, ciudadano);

        mockMvc.perform(post("/api/reportes/{id}/comentarios", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("El bache reaparecio, volvio a salir igual que antes"))
                        .header("Authorization", "Bearer " + token(ciudadano)))
                .andExpect(status().isCreated())
                // Ni siquiera a quien lo escribio.
                .andExpect(jsonPath("$.posibleReincidencia").doesNotExist());

        mockMvc.perform(get("/api/reportes/{id}/comentarios", reporte.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].posibleReincidencia").doesNotExist());

        // Pero el municipio SI lo ve: el flag vive en el reporte, no en el
        // comentario, y llega a la bandeja por ReporteResumenResponse.
        mockMvc.perform(get("/api/reportes/bandeja")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == %d)].posibleReincidencia".formatted(reporte.getId()),
                        org.hamcrest.Matchers.contains(true)));
    }
}
