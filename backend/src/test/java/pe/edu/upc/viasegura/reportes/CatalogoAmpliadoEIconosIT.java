package pe.edu.upc.viasegura.reportes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;
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
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.reportes.repository.ReporteRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * US-34 (catalogo ampliado: ciclovia, drenaje e iluminacion, V24) y US-29
 * Esc. 1 (icono de la categoria, de un conjunto cerrado validado en el
 * servidor).
 */
class CatalogoAmpliadoEIconosIT extends AbstractPostgisIT {

    /** Punto dentro de Miraflores. */
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    private static final String[] NUEVAS = {"Ciclovía dañada", "Drenaje obstruido", "Iluminación deficiente"};

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
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
    JdbcTemplate jdbcTemplate;

    private Distrito miraflores() {
        return distritoRepository.findByNombre("Miraflores").orElseThrow();
    }

    private String token(Rol rol, Distrito distrito) {
        Usuario u = guardarConTerminos(Usuario.builder()
                .email("cat-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Ruiz").rol(rol).distrito(distrito).build());
        return "Bearer " + jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private String json(String nombre, String icono) throws Exception {
        Map<String, Object> cuerpo = new HashMap<>();
        cuerpo.put("nombre", nombre);
        cuerpo.put("descripcion", "Propia");
        if (icono != null) {
            cuerpo.put("icono", icono);
        }
        return objectMapper.writeValueAsString(cuerpo);
    }

    private ResultActions crearCategoria(String token, String nombre, String icono) throws Exception {
        return mockMvc.perform(post("/api/categorias")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(nombre, icono))
                .header("Authorization", token));
    }

    private long idDe(String nombre) {
        return categoriaRepository.findByEsEstandarTrueOrderByNombreAsc().stream()
                .filter(c -> c.getNombre().equals(nombre))
                .map(CategoriaDano::getId)
                .findFirst().orElseThrow();
    }

    private ResultActions crearReporte(String token, long categoriaId) throws Exception {
        return mockMvc.perform(multipart("/api/reportes")
                .param("latitud", String.valueOf(LAT))
                .param("longitud", String.valueOf(LON))
                .param("titulo", "Daño de prueba").param("severidad", "MEDIA")
                .param("categoriaId", String.valueOf(categoriaId))
                .header("Authorization", token));
    }

    // ---- US-34 ----

    @Test
    void catalogoPublico_incluyeLasTresNuevas_conIcono_yTodasLasEstandarTienenIcono() throws Exception {
        ResultActions r = mockMvc.perform(get("/api/categorias")).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].icono", everyItem(notNullValue())));
        r.andExpect(jsonPath("$[?(@.nombre == 'Ciclovía dañada')].icono", everyItem(is("CICLOVIA"))))
                .andExpect(jsonPath("$[?(@.nombre == 'Drenaje obstruido')].icono", everyItem(is("DRENAJE"))))
                .andExpect(jsonPath("$[?(@.nombre == 'Iluminación deficiente')].icono", everyItem(is("ILUMINACION"))));
        for (String nombre : NUEVAS) {
            r.andExpect(jsonPath("$[?(@.nombre == '" + nombre + "')]", hasSize(1)))
                    .andExpect(jsonPath("$[?(@.nombre == '" + nombre + "')].esEstandar", everyItem(is(true))));
        }
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM categoria_dano WHERE es_estandar AND icono IS NULL", Long.class)).isZero();
    }

    @Test
    void lasNuevas_nuncaSeSugieren() {
        for (String nombre : NUEVAS) {
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT clase_modelo FROM categoria_dano WHERE es_estandar AND nombre = ?", String.class, nombre))
                    .isNull();
        }
    }

    @Test
    void deduplicacion_porCategoria_conLasNuevas() throws Exception {
        long ciclovia = idDe("Ciclovía dañada");
        long drenaje = idDe("Drenaje obstruido");

        crearReporte(token(Rol.CIUDADANO, null), ciclovia)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.esAdhesion", is(false)));
        // Mismo punto y misma categoria nueva: se acumula (US-09).
        crearReporte(token(Rol.CIUDADANO, null), ciclovia)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.esAdhesion", is(true)));
        // Mismo punto, otra categoria nueva: reporte aparte.
        crearReporte(token(Rol.CIUDADANO, null), drenaje)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.esAdhesion", is(false)));

        assertThat(reporteRepository.count()).isEqualTo(2);
    }

    @Test
    void nombreDeUnaNuevaEstandar_noSePuedeUsarEnUnDistrito_409() throws Exception {
        crearCategoria(token(Rol.FUNCIONARIO_MUNICIPAL, miraflores()), "ciclovía DAÑADA", null)
                .andExpect(status().isConflict());
    }

    // ---- US-29 Esc. 1 ----

    @Test
    void crearConIcono_loDevuelve_yLoMuestranElCatalogoYLaGestion() throws Exception {
        Distrito distrito = miraflores();
        String funcionario = token(Rol.FUNCIONARIO_MUNICIPAL, distrito);
        String nombre = "Puente peatonal dañado " + UUID.randomUUID();

        String cuerpo = crearCategoria(funcionario, nombre, "PUENTE")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.icono", is("PUENTE")))
                .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(cuerpo).get("id").asLong();

        mockMvc.perform(get("/api/categorias").param("distritoId", distrito.getId().toString()))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].icono", everyItem(is("PUENTE"))))
                .andExpect(jsonPath("$[?(@.id == " + id + ")]", hasSize(1)));
        mockMvc.perform(get("/api/categorias/gestion").header("Authorization", funcionario))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].icono", everyItem(is("PUENTE"))))
                .andExpect(jsonPath("$[?(@.id == " + id + ")]", hasSize(1)));
    }

    @Test
    void crearSinIcono_quedaNulo() throws Exception {
        crearCategoria(token(Rol.FUNCIONARIO_MUNICIPAL, miraflores()), "Sin icono " + UUID.randomUUID(), null)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.icono", nullValue()));
    }

    @Test
    void iconoFueraDelConjunto_400_alCrearYAlEditar() throws Exception {
        String funcionario = token(Rol.FUNCIONARIO_MUNICIPAL, miraflores());
        crearCategoria(funcionario, "Icono raro " + UUID.randomUUID(), "COHETE")
                .andExpect(status().isBadRequest());
        crearCategoria(funcionario, "Icono url " + UUID.randomUUID(), "https://ejemplo.com/i.png")
                .andExpect(status().isBadRequest());

        String cuerpo = crearCategoria(funcionario, "Editable " + UUID.randomUUID(), "OTRO")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(cuerpo).get("id").asLong();
        mockMvc.perform(patch("/api/categorias/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("Editable " + UUID.randomUUID(), "cohete"))
                        .header("Authorization", funcionario))
                .andExpect(status().isBadRequest());
        assertThat(jdbcTemplate.queryForObject("SELECT icono FROM categoria_dano WHERE id = ?", String.class, id))
                .isEqualTo("OTRO");
    }

    @Test
    void editar_cambiaElIcono_yOmitirloLoQuita() throws Exception {
        String funcionario = token(Rol.FUNCIONARIO_MUNICIPAL, miraflores());
        String cuerpo = crearCategoria(funcionario, "Con icono " + UUID.randomUUID(), "ARBOL")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(cuerpo).get("id").asLong();

        mockMvc.perform(patch("/api/categorias/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("Con icono " + UUID.randomUUID(), "ESCOMBROS"))
                        .header("Authorization", funcionario))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.icono", is("ESCOMBROS")));

        mockMvc.perform(patch("/api/categorias/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("Con icono " + UUID.randomUUID(), null))
                        .header("Authorization", funcionario))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.icono", nullValue()));
    }
}
