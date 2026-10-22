package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.OrderUtils;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.FinalidadConsentimiento;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.infra.AdministradorInicialSeeder;
import pe.edu.upc.viasegura.auth.repository.ConsentimientoRepository;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.distritos.infra.DistritoSeeder;
import pe.edu.upc.viasegura.municipalidades.infra.MunicipalidadSeeder;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * DEP-04: el primer ADMIN se crea desde variables; nunca se promueve una cuenta
 * existente ni se pisa la contrasena de un ADMIN.
 *
 * <p>Cada caso instancia el seeder con sus propios valores y llama a
 * {@code run} directamente: un fallo de arranque es la excepcion que
 * {@code SpringApplication} recibiria de un {@code ApplicationRunner}, sin
 * levantar un contexto por caso. El bean del contexto corre con
 * {@code app.admin-inicial.*} vacio (application-test.yml) y no hace nada.</p>
 *
 * <p>Las cuentas usan un dominio propio y se borran despues de cada test, para
 * no acumular ADMIN en la base compartida.</p>
 */
class AdministradorInicialSeederIT extends AbstractPostgisIT {

    private static final String DOMINIO = "@admin-inicial.test";
    private static final String PASSWORD = "Inicial-Segura-2026";
    private static final ApplicationArguments SIN_ARGUMENTOS = new DefaultApplicationArguments();

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    ConsentimientoRepository consentimientoRepository;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    JdbcTemplate jdbcTemplate;

    @AfterEach
    void borrarCuentasDelTest() {
        String patron = "%" + DOMINIO;
        jdbcTemplate.update("DELETE FROM consentimiento WHERE usuario_id IN"
                + " (SELECT id FROM usuario WHERE email LIKE ?)", patron);
        jdbcTemplate.update("DELETE FROM usuario WHERE email LIKE ?", patron);
    }

    private AdministradorInicialSeeder seeder(String email, String password, String nombre) {
        return new AdministradorInicialSeeder(usuarioRepository, passwordEncoder, email, password, nombre);
    }

    private static String correo() {
        return "admin-" + UUID.randomUUID() + DOMINIO;
    }

    // ------------------------------------------------------------ sin correo

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void sinCorreo_noHaceNadaNiValidaLaContrasena(String email) {
        long antes = usuarioRepository.count();

        // Una contrasena que no cumpliria el minimo: sin correo ni se mira.
        seeder(email, "corta", "Ana Admin").run(SIN_ARGUMENTOS);

        assertThat(usuarioRepository.count()).isEqualTo(antes);
    }

    // ------------------------------------------------------------ crea

    @Test
    void cuentaInexistente_laCreaComoAdminActivo_yEnSuPrimerLoginDebeAceptarLosTerminos() throws Exception {
        String email = correo();

        // Espacios alrededor, como los deja un copiar y pegar en el panel de variables.
        seeder("  " + email + " ", PASSWORD, "Ana María Pérez Rojas").run(SIN_ARGUMENTOS);

        Usuario admin = usuarioRepository.findByEmail(email).orElseThrow();
        assertThat(admin.getRol()).isEqualTo(Rol.ADMIN);
        assertThat(admin.isActivo()).isTrue();
        assertThat(admin.getNombre()).isEqualTo("Ana");
        assertThat(admin.getApellido()).isEqualTo("María Pérez Rojas");
        assertThat(admin.getDistrito()).isNull();
        assertThat(admin.getPasswordHash()).isNotEqualTo(PASSWORD).startsWith("$2");
        assertThat(passwordEncoder.matches(PASSWORD, admin.getPasswordHash())).isTrue();
        // D-12: sin consentimiento registrado por el seeder.
        assertThat(consentimientoRepository.findByUsuarioIdOrderByAceptadoEnDescIdDesc(admin.getId())).isEmpty();

        // Primer inicio de sesion: entra con la contrasena de la variable y como ADMIN...
        String respuesta = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario.rol", is("ADMIN")))
                .andExpect(jsonPath("$.usuario.debeAceptarTerminos", is(true)))
                .andReturn().getResponse().getContentAsString();
        String token = "Bearer " + objectMapper.readTree(respuesta).get("token").asText();

        // ...pero hasta aceptar los terminos vigentes no usa ninguna ruta privada.
        mockMvc.perform(get("/api/soporte/tickets").header("Authorization", token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.codigo", is("TERMINOS_PENDIENTES")));
        mockMvc.perform(post("/api/auth/me/consentimientos").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"finalidad\":\"%s\",\"version\":\"%s\"}"
                                .formatted(FinalidadConsentimiento.TERMINOS_Y_PRIVACIDAD, versionTerminos)))
                .andExpect(status().isCreated());
        mockMvc.perform(get("/api/soporte/tickets").header("Authorization", token))
                .andExpect(status().isOk());
    }

    @Test
    void sinNombre_usaAdministradorConApellidoVacio() {
        String email = correo();

        seeder(email, PASSWORD, "  ").run(SIN_ARGUMENTOS);

        Usuario admin = usuarioRepository.findByEmail(email).orElseThrow();
        assertThat(admin.getNombre()).isEqualTo(AdministradorInicialSeeder.NOMBRE_POR_DEFECTO);
        assertThat(admin.getApellido()).isEmpty();
    }

    // ------------------------------------------------------------ ya es ADMIN

    @Test
    void yaEsAdmin_noHaceNadaYNuncaPisaLaContrasena() {
        String email = correo();
        seeder(email, PASSWORD, "Ana Admin").run(SIN_ARGUMENTOS);
        // La persona cambia su contrasena despues del primer arranque.
        Usuario admin = usuarioRepository.findByEmail(email).orElseThrow();
        admin.setPasswordHash(passwordEncoder.encode("Cambiada-Por-La-Persona"));
        String hashVigente = usuarioRepository.save(admin).getPasswordHash();

        // Arranques siguientes con las variables todavia definidas: la misma
        // contrasena, otra, y una que no cumpliria el minimo (ya no se valida).
        seeder(email, PASSWORD, "Ana Admin").run(SIN_ARGUMENTOS);
        seeder(email, "Otra-Contrasena-Larga-99", "Otro Nombre").run(SIN_ARGUMENTOS);
        seeder(email, "corta", null).run(SIN_ARGUMENTOS);

        Usuario despues = usuarioRepository.findByEmail(email).orElseThrow();
        assertThat(despues.getRol()).isEqualTo(Rol.ADMIN);
        assertThat(despues.getPasswordHash()).isEqualTo(hashVigente);
        assertThat(passwordEncoder.matches("Cambiada-Por-La-Persona", despues.getPasswordHash())).isTrue();
        assertThat(despues.getNombre()).isEqualTo("Ana");
    }

    // ------------------------------------------------------------ otro rol

    @ParameterizedTest
    @EnumSource(value = Rol.class, names = {"CIUDADANO", "FUNCIONARIO_MUNICIPAL"})
    void cuentaConOtroRol_fallaElArranqueSinPromoverla(Rol rol) {
        String email = correo();
        // Alguien se registro antes con ese correo.
        String hashOriginal = usuarioRepository.save(Usuario.builder()
                        .email(email)
                        .passwordHash(passwordEncoder.encode("la-de-quien-se-registro"))
                        .nombre("Quien")
                        .apellido("Se Registro")
                        .rol(rol)
                        .activo(true)
                        .build())
                .getPasswordHash();

        assertThatThrownBy(() -> seeder(email, PASSWORD, null).run(SIN_ARGUMENTOS))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_INICIAL_EMAIL")
                .hasMessageContaining("rol " + rol)
                .hasMessageContaining("nunca se promueve");

        Usuario despues = usuarioRepository.findByEmail(email).orElseThrow();
        assertThat(despues.getRol()).isEqualTo(rol);
        assertThat(despues.getPasswordHash()).isEqualTo(hashOriginal);
    }

    // ------------------------------------------------------------ contrasena invalida

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"            ", "once-carac!"})
    void contrasenaAusenteOCorta_fallaElArranqueSinCrearLaCuenta(String password) {
        String email = correo();

        assertThatThrownBy(() -> seeder(email, password, null).run(SIN_ARGUMENTOS))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_INICIAL_PASSWORD")
                .hasMessageContaining("al menos " + AdministradorInicialSeeder.LONGITUD_MINIMA_PASSWORD)
                .hasMessageNotContaining("once-carac!");

        assertThat(usuarioRepository.findByEmail(email)).isEmpty();
    }

    @Test
    void contrasenaDeMasDe72Bytes_fallaElArranqueSinCrearLaCuenta() {
        String email = correo();
        // 40 caracteres, pero 80 bytes en UTF-8: BCrypt ignoraria el resto.
        String larga = "ñ".repeat(40);

        assertThatThrownBy(() -> seeder(email, larga, null).run(SIN_ARGUMENTOS))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_INICIAL_PASSWORD")
                .hasMessageContaining(AdministradorInicialSeeder.BYTES_MAXIMOS_PASSWORD + " bytes");

        assertThat(usuarioRepository.findByEmail(email)).isEmpty();
    }

    // ------------------------------------------------------------ correo invalido

    @ParameterizedTest
    @ValueSource(strings = {"sin-arroba.admin-inicial.test", "dos@@admin-inicial.test", "con espacio" + DOMINIO})
    void correoMalFormado_fallaElArranqueSinRepetirElValor(String email) {
        long antes = usuarioRepository.count();

        assertThatThrownBy(() -> seeder(email, PASSWORD, null).run(SIN_ARGUMENTOS))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_INICIAL_EMAIL no es un correo valido")
                .hasMessageNotContaining(email);

        assertThat(usuarioRepository.count()).isEqualTo(antes);
    }

    // ------------------------------------------------------------ orden

    @Test
    void correDespuesDeLosSeedersDeDistritosYMunicipalidades() {
        Integer orden = OrderUtils.getOrder(AdministradorInicialSeeder.class, Ordered.LOWEST_PRECEDENCE);

        assertThat(orden)
                .isGreaterThan(OrderUtils.getOrder(DistritoSeeder.class, Ordered.LOWEST_PRECEDENCE))
                .isGreaterThan(OrderUtils.getOrder(MunicipalidadSeeder.class, Ordered.LOWEST_PRECEDENCE));
    }
}
