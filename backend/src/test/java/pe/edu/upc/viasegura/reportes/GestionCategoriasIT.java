package pe.edu.upc.viasegura.reportes;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
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
 * Gestion de categorias personalizadas (US-29): listar con inactivas, editar,
 * desactivar y reactivar. {@code categoria_dano} no se limpia entre tests,
 * asi que cada categoria lleva un nombre unico y se afirma pertenencia, no
 * conteos de personalizadas.
 */
class GestionCategoriasIT extends AbstractPostgisIT {

    /** Punto dentro de Miraflores. */
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
    @Autowired
    JdbcTemplate jdbcTemplate;

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private Usuario funcionario(Distrito distritoGestion) {
        return guardarConTerminos(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).distrito(distritoGestion).build());
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

    private static String unico(String base) {
        return base + " " + UUID.randomUUID();
    }

    private CategoriaDano personalizada(Distrito distrito, String nombre) {
        return categoriaRepository.save(CategoriaDano.builder()
                .nombre(nombre).descripcion("Propia del distrito")
                .esEstandar(false).distrito(distrito).activo(true).build());
    }

    private CategoriaDano estandar() {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().get(0);
    }

    private ResultActions editar(Usuario u, long categoriaId, String nombre, String descripcion)
            throws Exception {
        return mockMvc.perform(patch("/api/categorias/{id}", categoriaId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nombre\":\"%s\",\"descripcion\":\"%s\"}".formatted(nombre, descripcion))
                .header("Authorization", "Bearer " + token(u)));
    }

    private ResultActions cambiarActiva(Usuario u, long categoriaId, boolean activa) throws Exception {
        return mockMvc.perform(patch("/api/categorias/{id}/activa", categoriaId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"activa\":" + activa + "}")
                .header("Authorization", "Bearer " + token(u)));
    }

    // ---- Listado de gestion ----

    @Test
    void gestion_listaEstandarYPropiasIncluidasLasInactivas() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano activa = personalizada(miraflores, unico("Malecon activo"));
        CategoriaDano inactiva = personalizada(miraflores, unico("Malecon inactivo"));
        CategoriaDano ajena = personalizada(distrito("Surquillo"), unico("Ajena"));
        cambiarActiva(func, inactiva.getId(), false).andExpect(status().isOk());

        mockMvc.perform(get("/api/categorias/gestion")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.esEstandar == true)]", hasSize(6)))
                .andExpect(jsonPath("$[?(@.id == " + activa.getId() + ")].activo", everyItem(is(true))))
                .andExpect(jsonPath("$[?(@.id == " + activa.getId() + ")]", hasSize(1)))
                .andExpect(jsonPath("$[?(@.id == " + inactiva.getId() + ")].activo", everyItem(is(false))))
                .andExpect(jsonPath("$[?(@.id == " + inactiva.getId() + ")]", hasSize(1)))
                .andExpect(jsonPath("$[?(@.id == " + ajena.getId() + ")]", hasSize(0)))
                // Invariante: solo estandar o personalizadas de su distrito.
                .andExpect(jsonPath("$[?(@.esEstandar == false && @.distritoNombre != 'Miraflores')]",
                        hasSize(0)));
    }

    @Test
    void gestion_ciudadano403_sinToken401() throws Exception {
        mockMvc.perform(get("/api/categorias/gestion")
                        .header("Authorization", "Bearer " + token(ciudadano())))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/categorias/gestion"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void catalogoPublico_noExponeActivo() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        CategoriaDano propia = personalizada(miraflores, unico("Visible"));

        mockMvc.perform(get("/api/categorias").param("distritoId", miraflores.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + propia.getId() + ")]", hasSize(1)))
                .andExpect(jsonPath("$[*].activo", hasSize(0)));
    }

    // ---- Editar ----

    @Test
    void editarPropia_200() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano cat = personalizada(miraflores, unico("Original"));
        String nuevoNombre = unico("Renombrada");

        editar(func, cat.getId(), nuevoNombre, "Nueva descripcion")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nombre", is(nuevoNombre)))
                .andExpect(jsonPath("$.descripcion", is("Nueva descripcion")))
                .andExpect(jsonPath("$.activo", is(true)))
                .andExpect(jsonPath("$.esEstandar", is(false)));

        // Mismo nombre que ya tiene, en otra capitalizacion: no choca consigo misma.
        editar(func, cat.getId(), nuevoNombre.toUpperCase(), "Otra")
                .andExpect(status().isOk());
    }

    @Test
    void editarSoloNombre_reemplazaLaDescripcionPorNull() throws Exception {
        // PATCH de categoria = reemplazo de los dos campos editables
        // (a diferencia del PATCH parcial de reportes, US-08).
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano cat = personalizada(miraflores, unico("Con descripcion"));
        String nuevoNombre = unico("Sin descripcion");

        mockMvc.perform(patch("/api/categorias/{id}", cat.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nombre\":\"%s\"}".formatted(nuevoNombre))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nombre", is(nuevoNombre)))
                .andExpect(jsonPath("$.descripcion", nullValue()));
    }

    @Test
    void personalizadaAntiguaConNombreDeEstandar_puedeEditarSuDescripcion_200() throws Exception {
        // Anterior a la regla de nombre unico frente a las estandar: se crea
        // por SQL directo porque la API ya no lo permite.
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        String nombreEstandar = estandar().getNombre();
        Long id = jdbcTemplate.queryForObject(
                "INSERT INTO categoria_dano (nombre, descripcion, es_estandar, distrito_id, activo) "
                        + "VALUES (?, 'Antigua', FALSE, ?, TRUE) RETURNING id",
                Long.class, nombreEstandar, miraflores.getId());

        editar(func, id, nombreEstandar, "Descripcion corregida")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nombre", is(nombreEstandar)))
                .andExpect(jsonPath("$.descripcion", is("Descripcion corregida")));

        // categoria_dano no se limpia entre tests: se borra para no dejar en
        // Miraflores una personalizada homonima de una estandar.
        jdbcTemplate.update("DELETE FROM categoria_dano WHERE id = ?", id);
    }

    @Test
    void editarConNombreDuplicadoEnElDistrito_409() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano existente = personalizada(miraflores, unico("Existente"));
        CategoriaDano otra = personalizada(miraflores, unico("Otra"));

        editar(func, otra.getId(), existente.getNombre().toLowerCase(), "x")
                .andExpect(status().isConflict());
    }

    @Test
    void nombreIgualAUnaEstandar_409_alEditarYAlCrear() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano cat = personalizada(miraflores, unico("Propia"));
        String nombreEstandar = estandar().getNombre().toUpperCase();

        editar(func, cat.getId(), nombreEstandar, "x")
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/categorias")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nombre\":\"%s\"}".formatted(nombreEstandar))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isConflict());
    }

    @Test
    void editarConNombreEnBlanco_400() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano cat = personalizada(miraflores, unico("Propia"));

        editar(func, cat.getId(), " ", "x").andExpect(status().isBadRequest());
    }

    // ---- Desactivar / reactivar ----

    @Test
    void desactivar_saleDelCatalogo_yNoSePuedeUsarEnUnReporteNuevo_reactivarLaDevuelve() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano cat = personalizada(miraflores, unico("Temporal"));
        String filtroCat = "$[?(@.id == " + cat.getId() + ")]";

        cambiarActiva(func, cat.getId(), false)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activo", is(false)));

        mockMvc.perform(get("/api/categorias").param("distritoId", miraflores.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath(filtroCat, hasSize(0)));

        mockMvc.perform(multipart("/api/reportes")
                        .param("latitud", String.valueOf(LAT))
                        .param("longitud", String.valueOf(LON))
                        .param("titulo", "Dano de prueba").param("severidad", "MEDIA")
                        .param("categoriaId", cat.getId().toString())
                        .param("descripcion", "Con categoria desactivada")
                        .header("Authorization", "Bearer " + token(ciudadano())))
                .andExpect(status().isConflict());

        cambiarActiva(func, cat.getId(), true)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activo", is(true)));

        mockMvc.perform(get("/api/categorias").param("distritoId", miraflores.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath(filtroCat, hasSize(1)));
    }

    @Test
    void cambiarActivaSinValor_400() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano cat = personalizada(miraflores, unico("Propia"));

        mockMvc.perform(patch("/api/categorias/{id}/activa", cat.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}")
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void reportePendienteConCategoriaDesactivada_sigueEditable() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        CategoriaDano cat = personalizada(miraflores, unico("Se desactivara"));
        CategoriaDano otraInactiva = personalizada(miraflores, unico("Tambien inactiva"));
        Usuario creador = ciudadano();
        Reporte reporte = reporteRepository.save(Reporte.builder()
                .titulo("Dano de prueba").severidad(Severidad.MEDIA)
                .ubicacion(GeometryUtils.point(LON, LAT))
                .categoria(cat).creador(creador).distrito(miraflores)
                .estado(EstadoReporte.PENDIENTE).totalAdhesiones(1).build());
        cambiarActiva(func, cat.getId(), false).andExpect(status().isOk());
        cambiarActiva(func, otraInactiva.getId(), false).andExpect(status().isOk());

        // Solo la descripcion: 200, el reporte conserva su categoria.
        mockMvc.perform(patch("/api/reportes/{id}", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"descripcion\":\"Ahora es mas grande\"}")
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.descripcion", is("Ahora es mas grande")));

        // Reenviar la misma categoria (como hace un formulario completo): 200.
        mockMvc.perform(patch("/api/reportes/{id}", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoriaId\":%d,\"descripcion\":\"Otra vez\"}".formatted(cat.getId()))
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isOk());

        // Cambiar A otra categoria inactiva sigue prohibido: 409.
        mockMvc.perform(patch("/api/reportes/{id}", reporte.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoriaId\":%d}".formatted(otraInactiva.getId()))
                        .header("Authorization", "Bearer " + token(creador)))
                .andExpect(status().isConflict());
    }

    // ---- Autorizacion por instancia ----

    @Test
    void estandar_noSeEditaNiDesactiva_403() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        CategoriaDano est = estandar();

        editar(func, est.getId(), unico("Hackeada"), "x")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message", is("Las categorías estándar no se pueden editar ni desactivar")));
        cambiarActiva(func, est.getId(), false)
                .andExpect(status().isForbidden());
    }

    @Test
    void deOtroDistrito_403() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        CategoriaDano ajena = personalizada(distrito("Surquillo"), unico("De Surquillo"));

        editar(func, ajena.getId(), unico("Intento"), "x")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message", is("Solo puedes gestionar las categorías personalizadas de Miraflores")));
        cambiarActiva(func, ajena.getId(), false)
                .andExpect(status().isForbidden());
    }

    @Test
    void ciudadanoNoGestiona_403() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        CategoriaDano cat = personalizada(miraflores, unico("Propia"));
        Usuario ciu = ciudadano();

        editar(ciu, cat.getId(), unico("Intento"), "x").andExpect(status().isForbidden());
        cambiarActiva(ciu, cat.getId(), false).andExpect(status().isForbidden());
    }

    @Test
    void categoriaInexistente_404() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));

        editar(func, 999_999_999L, unico("Nada"), "x").andExpect(status().isNotFound());
        cambiarActiva(func, 999_999_999L, false).andExpect(status().isNotFound());
    }
}
