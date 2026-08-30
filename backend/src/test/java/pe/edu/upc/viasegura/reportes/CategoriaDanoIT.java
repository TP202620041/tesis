package pe.edu.upc.viasegura.reportes;

import static org.hamcrest.Matchers.everyItem;
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
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Categorias de dano personalizadas por distrito (US-29). */
class CategoriaDanoIT extends AbstractPostgisIT {

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

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private Usuario funcionario(Distrito distritoGestion) {
        return usuarioRepository.save(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal")
                .rol(Rol.FUNCIONARIO_MUNICIPAL).distrito(distritoGestion).build());
    }

    private Usuario ciudadano() {
        return usuarioRepository.save(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private String cuerpo(String nombre) {
        return "{\"nombre\":\"%s\",\"descripcion\":\"Dano especifico del distrito\"}".formatted(nombre);
    }

    @Test
    void funcionarioCreaCategoriaPropiaDeSuDistrito_201() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));

        mockMvc.perform(post("/api/categorias")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("Malecon danado " + UUID.randomUUID()))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.esEstandar", is(false)))
                .andExpect(jsonPath("$.distritoNombre", is("Miraflores")));
    }

    @Test
    void nombreDuplicadoEnElMismoDistrito_409() throws Exception {
        Usuario func = funcionario(distrito("Miraflores"));
        String nombre = "Ciclovia obstruida " + UUID.randomUUID();

        mockMvc.perform(post("/api/categorias")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(nombre))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/categorias")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(nombre))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isConflict());
    }

    @Test
    void funcionarioSinDistritoAsignado_403() throws Exception {
        Usuario funcSinDistrito = usuarioRepository.save(Usuario.builder()
                .email("func-sindistrito-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("SinDistrito").rol(Rol.FUNCIONARIO_MUNICIPAL).build());

        mockMvc.perform(post("/api/categorias")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("Cualquiera"))
                        .header("Authorization", "Bearer " + token(funcSinDistrito)))
                .andExpect(status().isForbidden());
    }

    @Test
    void ciudadanoNoPuedeCrearCategoria_403() throws Exception {
        mockMvc.perform(post("/api/categorias")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("Cualquiera"))
                        .header("Authorization", "Bearer " + token(ciudadano())))
                .andExpect(status().isForbidden());
    }

    @Test
    void sinToken_401() throws Exception {
        mockMvc.perform(post("/api/categorias")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo("Cualquiera")))
                .andExpect(status().isUnauthorized());
    }

    // --- Catalogo publico de categorias (GET) -------------------------------
    // Nota: la BD de test es persistente y `categoria_dano` no se limpia entre
    // clases (las personalizadas se acumulan entre corridas), asi que estos
    // tests afirman invariantes y pertenencia, no conteos exactos de
    // personalizadas. Las estandar SI son un conteo estable: son las 6 del
    // seed V3 y nada en la suite crea estandar nuevas.

    @Test
    void sinFiltroDeDistrito_devuelveSoloLas6Estandar() throws Exception {
        mockMvc.perform(get("/api/categorias"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(6)))
                .andExpect(jsonPath("$[*].esEstandar", everyItem(is(true))))
                // Orden alfabetico estable, util para el selector del frontend.
                .andExpect(jsonPath("$[0].nombre", is("Bache")));
    }

    @Test
    void conFiltroDeDistrito_devuelveEstandarMasLasPersonalizadasDeEseDistrito() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        String nombrePropio = "Malecon erosionado " + UUID.randomUUID();

        mockMvc.perform(post("/api/categorias")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(nombrePropio))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/categorias").param("distritoId", miraflores.getId().toString()))
                .andExpect(status().isOk())
                // Incluye la recien creada...
                .andExpect(jsonPath("$[?(@.nombre == '" + nombrePropio + "')]", hasSize(1)))
                // ...y sigue incluyendo las 6 estandar.
                .andExpect(jsonPath("$[?(@.esEstandar == true)]", hasSize(6)))
                // Invariante clave: TODO lo devuelto es seleccionable en este
                // distrito -- o es estandar, o es personalizada de Miraflores.
                .andExpect(jsonPath("$[?(@.esEstandar == false && @.distritoNombre != 'Miraflores')]",
                        hasSize(0)));
    }

    @Test
    void distritoDistinto_noVeLasPersonalizadasDeOtroDistrito() throws Exception {
        Distrito miraflores = distrito("Miraflores");
        Usuario func = funcionario(miraflores);
        String nombrePropio = "Acantilado inestable " + UUID.randomUUID();

        mockMvc.perform(post("/api/categorias")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cuerpo(nombrePropio))
                        .header("Authorization", "Bearer " + token(func)))
                .andExpect(status().isCreated());

        // Consultada desde OTRO distrito, la categoria de Miraflores no aparece:
        // no seria valida ahi (ReporteService#validarCategoriaParaDistrito).
        mockMvc.perform(get("/api/categorias")
                        .param("distritoId", distrito("Surquillo").getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.nombre == '" + nombrePropio + "')]", hasSize(0)));
    }

    @Test
    void catalogoDeCategorias_esPublicoSinToken() throws Exception {
        mockMvc.perform(get("/api/categorias"))
                .andExpect(status().isOk());
    }
}
