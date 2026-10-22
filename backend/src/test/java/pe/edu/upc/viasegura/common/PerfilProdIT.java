package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * La aplicacion con el perfil {@code prod} (DEP-02).
 *
 * <p>Corre con los perfiles {@code test} y {@code prod}: la BD, el SMTP y el
 * directorio de fotos los sigue fijando {@link AbstractPostgisIT}, y el resto
 * sale de {@code application-prod.yml}, que va despues y gana. Como alli la
 * bandera del secreto de desarrollo queda en {@code false}, el secreto es uno
 * propio, generado para esta corrida, igual que en un despliegue (SEC-03).</p>
 *
 * <p>{@code server.error.include-message: never} solo afecta al {@code /error}
 * de Spring Boot. Los {@code ApiError} que arma {@code GlobalExceptionHandler}
 * conservan su mensaje, que es lo que lee el frontend
 * ({@code frontend/src/lib/api/errors.ts}); este IT lo comprueba con un 409
 * conocido.</p>
 */
@ActiveProfiles("prod")
@TestPropertySource(properties = "CORS_ALLOWED_ORIGINS=https://pwa.ciudadviva.test")
class PerfilProdIT extends AbstractPostgisIT {

    private static final String SECRETO_PROPIO = secretoAleatorio();

    /** El de application-local.yml y application-test.yml (SEC-03). */
    private static final String SECRETO_DE_DESARROLLO_PUBLICADO =
            "Y2hhbmdlLW1lLXRoaXMtaXMtYS1kZXYtb25seS1zZWNyZXQtMDEyMzQ1Njc4OQ==";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    Environment environment;

    private static String secretoAleatorio() {
        byte[] clave = new byte[48];
        new SecureRandom().nextBytes(clave);
        return Base64.getEncoder().encodeToString(clave);
    }

    @DynamicPropertySource
    static void secretoDeProduccion(DynamicPropertyRegistry registry) {
        registry.add("security.jwt.secret", () -> SECRETO_PROPIO);
    }

    private ResultActions registrar(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/registro")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"secreta123","nombre":"Ana","apellido":"Vecina","aceptaTerminos":true,"versionTerminos":"%s"}
                        """.formatted(email, versionTerminos)));
    }

    @Test
    void elPerfilProdGanaSobreElDeTest() {
        assertThat(environment.getActiveProfiles()).containsExactly("test", "prod");
        assertThat(environment.getProperty("security.jwt.permitir-secreto-de-desarrollo")).isEqualTo("false");
        assertThat(environment.getProperty("server.error.include-message")).isEqualTo("never");
        assertThat(environment.getProperty("server.error.include-stacktrace")).isEqualTo("never");
        assertThat(environment.getProperty("spring.flyway.baseline-on-migrate")).isEqualTo("false");
        assertThat(environment.getProperty("spring.jpa.show-sql")).isEqualTo("false");
        assertThat(environment.getProperty("server.forward-headers-strategy")).isEqualTo("framework");
        assertThat(environment.getProperty("server.shutdown")).isEqualTo("graceful");
        assertThat(environment.getProperty("springdoc.api-docs.enabled")).isEqualTo("false");
        assertThat(environment.getProperty("springdoc.swagger-ui.enabled")).isEqualTo("false");
        assertThat(environment.getProperty("app.cors.allowed-origins")).isEqualTo("https://pwa.ciudadviva.test");
    }

    @Test
    void unConflictoDeNegocio_conservaSuMensaje() throws Exception {
        String email = "prod-" + UUID.randomUUID() + "@lima.pe";
        registrar(email).andExpect(status().isCreated());

        registrar(email)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message").value("El correo ya esta registrado"))
                .andExpect(jsonPath("$.path").value("/api/auth/registro"));
    }

    @Test
    void elTokenFirmadoConElSecretoPropio_autentica() throws Exception {
        String email = "prod-" + UUID.randomUUID() + "@lima.pe";
        String respuesta = registrar(email)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(respuesta).get("token").asText();

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void unTokenForjadoConElSecretoPublicado_noAutentica() throws Exception {
        // SEC-03: con el secreto del repositorio se puede firmar un token para
        // cualquier email; en prod ese token no verifica.
        String email = "prod-" + UUID.randomUUID() + "@lima.pe";
        registrar(email).andExpect(status().isCreated());
        String forjado = Jwts.builder()
                .subject(email)
                .claims(Map.of("rol", "ADMIN"))
                .issuedAt(new Date())
                .expiration(Date.from(Instant.now().plus(1, ChronoUnit.HOURS)))
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRETO_DE_DESARROLLO_PUBLICADO)))
                .compact();

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + forjado))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void openApiYSwaggerUi_apagados() throws Exception {
        mockMvc.perform(get("/v3/api-docs")).andExpect(status().isNotFound());
        mockMvc.perform(get("/swagger-ui.html")).andExpect(status().isNotFound());
    }

    @Test
    void healthcheck_200Up() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
