package pe.edu.upc.viasegura.desempeno;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
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
import pe.edu.upc.viasegura.desempeno.service.DesempenoService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.Calificacion;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.domain.EstadoReporte;
import pe.edu.upc.viasegura.reportes.domain.Reporte;
import pe.edu.upc.viasegura.reportes.repository.CalificacionRepository;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisMailIT;

/** Indice publico de desempeno distrital (US-18, US-20). */
class DesempenoIT extends AbstractPostgisMailIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
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
    CalificacionRepository calificacionRepository;
    @Autowired
    DesempenoService desempenoService;

    /**
     * Deja la vista materializada de acuerdo con la BD ya limpia.
     *
     * <p>La limpieza FK-safe de {@code AbstractPostgisIT} borra los reportes,
     * pero la vista es una foto: sin refrescarla conserva los conteos del
     * test anterior. Eso acoplaba en silencio cada test al que corrio antes
     * — los que afirman DESPUES de una accion que dispara refresh no lo
     * notaban, pero cualquier precondicion sobre el estado inicial fallaba.
     * Corre despues del {@code @BeforeEach} de la superclase (JUnit ejecuta
     * primero el de la clase padre).</p>
     */
    @BeforeEach
    void refrescarIndiceTrasLaLimpieza() {
        desempenoService.refrescarIndice();
    }

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

    private Reporte reporte(Distrito distrito, EstadoReporte estado, Usuario creador, Instant resolvedAt) {
        return reporteRepository.save(Reporte.builder()
                .ubicacion(GeometryUtils.point(-77.0297, -12.1215))
                .categoria(categoria()).creador(creador).distrito(distrito)
                .estado(estado).totalAdhesiones(1).resolvedAt(resolvedAt).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    /** GET del ranking general y devuelve la fila del distrito pedido. */
    private JsonNode filaDistrito(String distritoNombre, String bearer) throws Exception {
        var req = get("/api/desempeno/distritos");
        if (bearer != null) {
            req = req.header("Authorization", "Bearer " + bearer);
        }
        String json = mockMvc.perform(req)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        for (JsonNode fila : objectMapper.readTree(json)) {
            if (distritoNombre.equals(fila.path("distritoNombre").asText())) {
                return fila;
            }
        }
        throw new AssertionError("No se encontro el distrito " + distritoNombre + " en el ranking");
    }

    @Test
    void tasaResolucion_conDatosConocidos() throws Exception {
        Usuario ciu = ciudadano();
        Distrito miraflores = distrito("Miraflores");
        // 4 reportes: 2 resueltos, 2 no -> tasa esperada 50%.
        reporte(miraflores, EstadoReporte.RESUELTO, ciu, Instant.now());
        reporte(miraflores, EstadoReporte.RESUELTO, ciu, Instant.now());
        reporte(miraflores, EstadoReporte.EN_PROCESO, ciu, null);
        reporte(miraflores, EstadoReporte.RECIBIDO, ciu, null);
        desempenoService.refrescarIndice();

        JsonNode fila = filaDistrito("Miraflores", null);
        assertThat(fila.path("totalReportes").asLong()).isEqualTo(4);
        assertThat(fila.path("totalResueltos").asLong()).isEqualTo(2);
        assertThat(fila.path("tasaResolucion").asDouble()).isEqualTo(50.0);
    }

    @Test
    void satisfaccion_reflejaCalificaciones() throws Exception {
        Usuario ciu = ciudadano();
        Distrito barranco = distrito("Barranco");
        Reporte r1 = reporte(barranco, EstadoReporte.RESUELTO, ciu, Instant.now());
        Reporte r2 = reporte(barranco, EstadoReporte.RESUELTO, ciu, Instant.now());
        calificacionRepository.save(Calificacion.builder().reporte(r1).usuario(ciu).estrellas(4).build());
        calificacionRepository.save(Calificacion.builder().reporte(r2).usuario(ciu).estrellas(2).build());
        desempenoService.refrescarIndice();

        JsonNode fila = filaDistrito("Barranco", null);
        // Promedio de 4 y 2 = 3.00 sobre 2 calificaciones.
        assertThat(fila.path("satisfaccionPromedio").asDouble()).isEqualTo(3.0);
        assertThat(fila.path("totalCalificaciones").asLong()).isEqualTo(2);
    }

    @Test
    void endpointAccesibleSinToken() throws Exception {
        String json = mockMvc.perform(get("/api/desempeno/distritos"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        // Informacion publica: hay una fila por distrito (43 cargados).
        assertThat(objectMapper.readTree(json)).isNotEmpty();
    }

    @Test
    void resolverReporte_actualizaTasaEnTiempoReal() throws Exception {
        // Un unico reporte EN_PROCESO en San Isidro; sin refresh manual.
        Usuario ciu = ciudadano();
        Distrito sanIsidro = distrito("San Isidro");
        Usuario func = funcionario(sanIsidro);
        Reporte reporte = reporte(sanIsidro, EstadoReporte.EN_PROCESO, ciu, null);

        // Al resolverlo por el endpoint, el listener AFTER_COMMIT refresca el
        // indice: la tasa pasa a 100% (1/1) sin intervencion manual.
        mockMvc.perform(patch("/api/reportes/{id}/estado", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"estado\":\"RESUELTO\",\"comentario\":\"Bache tapado\"}")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk());

        JsonNode fila = filaDistrito("San Isidro", null);
        assertThat(fila.path("totalResueltos").asLong()).isEqualTo(1);
        assertThat(fila.path("tasaResolucion").asDouble()).isEqualTo(100.0);
    }

    // --- Los otros eventos que mueven el indice --------------------------
    // La justificacion original solo contemplaba resolucion y calificacion.
    // Estos tests cubren los demas: crear, cancelar y mover de categoria.
    // Todos usan los endpoints reales (no el repositorio) porque lo que se
    // verifica es que el evento se publique, y ninguno hace refresh manual.

    /** Coordenadas dentro de Pueblo Libre, distrito que estos tests dejan vacio. */
    private static final double LAT_PUEBLO_LIBRE = -12.0700;
    private static final double LON_PUEBLO_LIBRE = -77.0500;

    private String tokenCiudadanoNuevo() throws Exception {
        return token(ciudadano());
    }

    /** Crea un reporte por el endpoint real y devuelve su id. */
    private long crearReportePorEndpoint(String bearer, long categoriaId) throws Exception {
        String json = mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", String.valueOf(LAT_PUEBLO_LIBRE))
                        .param("longitud", String.valueOf(LON_PUEBLO_LIBRE))
                        .param("categoriaId", String.valueOf(categoriaId))
                        .header("Authorization", "Bearer " + bearer))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json).path("id").asLong();
    }

    @Test
    void crearReporte_actualizaElTotalEnTiempoReal() throws Exception {
        // REGRESION: crear un reporte incrementa total_reportes, que es el
        // DENOMINADOR de la tasa. Antes no disparaba refresh, asi que el
        // indice publico seguia mostrando la tasa anterior -- mejor que la
        // real -- hasta que ocurriera algo no relacionado.
        assertThat(filaDistrito("Pueblo Libre", null).path("totalReportes").asLong()).isZero();

        crearReportePorEndpoint(tokenCiudadanoNuevo(), categoria().getId());

        JsonNode fila = filaDistrito("Pueblo Libre", null);
        assertThat(fila.path("totalReportes").asLong())
                .as("sin refresh manual ni evento ajeno")
                .isEqualTo(1);
        // Un reporte sin resolver: la tasa es 0 %, no "sin datos".
        assertThat(fila.path("tasaResolucion").asDouble()).isZero();
    }

    @Test
    void adherirse_noInflaElTotalDeReportes() throws Exception {
        // US-09: adherirse NO crea fila en `reporte`, asi que el total debe
        // seguir en 1. Si el conteo subiera, la tasa de un distrito caeria
        // por vecinos respaldando el mismo dano.
        long categoria = categoria().getId();
        crearReportePorEndpoint(tokenCiudadanoNuevo(), categoria);
        crearReportePorEndpoint(tokenCiudadanoNuevo(), categoria);

        assertThat(filaDistrito("Pueblo Libre", null).path("totalReportes").asLong()).isEqualTo(1);
    }

    @Test
    void cancelarReporte_loSacaDelIndiceEnTiempoReal() throws Exception {
        // La vista excluye los CANCELADO (V7), pero cancelar tampoco
        // disparaba refresh: el reporte retirado seguia contando.
        String bearer = tokenCiudadanoNuevo();
        long reporteId = crearReportePorEndpoint(bearer, categoria().getId());
        assertThat(filaDistrito("Pueblo Libre", null).path("totalReportes").asLong()).isEqualTo(1);

        mockMvc.perform(delete("/api/reportes/{id}", reporteId)
                        .header("Authorization", "Bearer " + bearer))
                .andExpect(status().isOk());

        JsonNode fila = filaDistrito("Pueblo Libre", null);
        assertThat(fila.path("totalReportes").asLong()).isZero();
        // Sin reportes validos no hay tasa: null, que no es lo mismo que 0 %.
        assertThat(fila.path("tasaResolucion").isNull()).isTrue();
    }

    @Test
    void cambiarCategoria_actualizaElDesglosePorCategoria() throws Exception {
        // US-20 agrupa por (distrito, categoria): mover el reporte resta en
        // una fila y suma en la otra. El agregado general no cambia.
        var estandar = categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar).limit(2).toList();
        long origen = estandar.get(0).getId();
        long destino = estandar.get(1).getId();

        String bearer = tokenCiudadanoNuevo();
        long reporteId = crearReportePorEndpoint(bearer, origen);
        assertThat(totalEnCategoria("Pueblo Libre", origen)).isEqualTo(1);

        mockMvc.perform(patch("/api/reportes/{id}", reporteId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoriaId\":" + destino + "}")
                        .header("Authorization", "Bearer " + bearer))
                .andExpect(status().isOk());

        assertThat(totalEnCategoria("Pueblo Libre", destino)).isEqualTo(1);
        assertThat(totalEnCategoria("Pueblo Libre", origen)).isZero();
        // El total del distrito no se movio: sigue siendo un reporte.
        assertThat(filaDistrito("Pueblo Libre", null).path("totalReportes").asLong()).isEqualTo(1);
    }

    /** Total de reportes de un distrito en el desglose de una categoria (US-20). */
    private long totalEnCategoria(String distritoNombre, long categoriaId) throws Exception {
        String json = mockMvc.perform(get("/api/desempeno/distritos")
                        .param("categoriaId", String.valueOf(categoriaId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        for (JsonNode fila : objectMapper.readTree(json)) {
            if (distritoNombre.equals(fila.path("distritoNombre").asText())) {
                return fila.path("totalReportes").asLong();
            }
        }
        // El desglose por categoria solo trae distritos con reportes de ese
        // tipo: ausente equivale a cero.
        return 0;
    }
}
