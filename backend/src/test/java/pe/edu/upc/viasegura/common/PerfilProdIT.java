package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcBuilderCustomizer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.port.RecepcionDeCorreo;
import pe.edu.upc.viasegura.auth.port.VerificadorDeDominioDeCorreo;
import pe.edu.upc.viasegura.clasificacion.infra.InferenciaHttpAdapter;
import pe.edu.upc.viasegura.clasificacion.port.ClasificadorDano;
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
 *
 * <p>La clasificacion va como en el despliegue (NC-04b): {@code http}, con
 * una {@code CLASIFICACION_URL} que aqui no responde. Ningun test de esta
 * clase crea un reporte con foto, asi que nunca se la llama; si se la
 * llamara, el resultado seria «sin sugerencia».</p>
 *
 * <p>NC-09: en prod el dominio del correo se verifica por DNS sin que haga
 * falta una variable. El puerto se simula ({@code lima.pe}, el dominio de los
 * correos de los IT, no existe en el DNS), y el registro ya no devuelve
 * sesion: los tests confirman la cuenta y entran por el login.</p>
 *
 * <p>DEP-14: en prod el API exige el encabezado de origen que agrega
 * Cloudflare. Aqui cada peticion de {@link MockMvc} lo lleva, como si llegara
 * por el proxy ({@link ComoSiLlegaraPorCloudflare}), asi que todos los casos
 * de esta clase prueban tambien que con el encabezado el API funciona igual.
 * Los rechazos sin el encabezado estan en {@code EncabezadoDeOrigenIT}.</p>
 */
@ActiveProfiles("prod")
@TestPropertySource(properties = {
        "CORS_ALLOWED_ORIGINS=https://pwa.ciudadviva.test",
        // DEP-12: obligatoria en prod; disco local en los tests.
        "FOTOS_ALMACEN=local",
        // DEP-08: obligatorias en prod. `smtp` para que los correos sigan
        // yendo a GreenMail y no a un proveedor real.
        "CORREO_TIPO=smtp",
        "NOTIF_FROM=Ciudad Viva <no-reply@ciudadviva.test>",
        // NC-08: obligatoria en prod. `ninguno` para no llamar a Google.
        "CAPTCHA_TIPO=ninguno",
        // NC-04b: obligatoria en prod; con `http`, tambien la URL.
        "CLASIFICACION_TIPO=http",
        "CLASIFICACION_URL=http://127.0.0.1:1",
        // DEP-14: obligatoria en prod. Un valor de prueba evidente.
        "ORIGEN_SECRETO=" + PerfilProdIT.SECRETO_DE_ORIGEN})
class PerfilProdIT extends AbstractPostgisIT {

    static final String SECRETO_DE_ORIGEN = "secreto-de-origen-de-prueba-0123456789";
    private static final String ENCABEZADO_DE_ORIGEN = "X-Origen-Secreto";

    /** DEP-14: cada peticion lleva el encabezado de origen, como si pasara por Cloudflare. */
    @TestConfiguration
    static class ComoSiLlegaraPorCloudflare {

        @Bean
        MockMvcBuilderCustomizer encabezadoDeOrigenEnCadaPeticion() {
            return builder -> builder.defaultRequest(get("/").header(ENCABEZADO_DE_ORIGEN, SECRETO_DE_ORIGEN));
        }
    }

    private static final String SECRETO_PROPIO = secretoAleatorio();

    /** El de application-local.yml y application-test.yml (SEC-03). */
    private static final String SECRETO_DE_DESARROLLO_PUBLICADO =
            "Y2hhbmdlLW1lLXRoaXMtaXMtYS1kZXYtb25seS1zZWNyZXQtMDEyMzQ1Njc4OQ==";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    Environment environment;
    @Autowired
    ClasificadorDano clasificador;

    /**
     * NC-09: en prod el adaptador del dominio es el de DNS. Se simula para
     * que la suite no dependa de la red ni de los registros MX de lima.pe; el
     * adaptador real lo prueba {@code DnsVerificadorDeDominioAdapterTest}.
     */
    @MockitoBean
    VerificadorDeDominioDeCorreo verificadorDeDominio;

    @BeforeEach
    void dominioQueRecibeCorreo() {
        when(verificadorDeDominio.verificar(anyString())).thenReturn(RecepcionDeCorreo.RECIBE);
    }

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
        // DEP-12: en prod el almacen de fotos sale de FOTOS_ALMACEN, sin default.
        assertThat(environment.getProperty("app.storage.tipo")).isEqualTo("local");
        // DEP-08: en prod el tipo de correo y el remitente salen del entorno, sin default.
        assertThat(environment.getProperty("app.correo.tipo")).isEqualTo("smtp");
        assertThat(environment.getProperty("app.notificaciones.email-remitente"))
                .isEqualTo("Ciudad Viva <no-reply@ciudadviva.test>");
        // NC-08: en prod el captcha sale de CAPTCHA_TIPO, sin default.
        assertThat(environment.getProperty("app.captcha.tipo")).isEqualTo("ninguno");
        // NC-04b: en prod la clasificacion sale de CLASIFICACION_TIPO, sin default.
        assertThat(environment.getProperty("app.clasificacion.tipo")).isEqualTo("http");
        assertThat(environment.getProperty("app.clasificacion.http.url")).isEqualTo("http://127.0.0.1:1");
        // ...y la respuesta del falso sigue literal y vacia, aunque el perfil test
        // diga otra: CLASIFICACION_TIPO=falso apaga la clasificacion.
        assertThat(environment.getProperty("app.clasificacion.falso.respuesta")).isEmpty();
        // NC-09: en prod el registro consulta el MX sin que haga falta una
        // variable nueva (el perfil test dice `ninguno`; prod gana).
        assertThat(environment.getProperty("app.dominio-correo.tipo")).isEqualTo("dns");
        // DEP-14: en prod el secreto de origen sale de ORIGEN_SECRETO, sin
        // default (el perfil test dice `ninguno`; prod gana), y sin rotacion.
        assertThat(environment.getProperty("app.origen.secreto")).isEqualTo(SECRETO_DE_ORIGEN);
        assertThat(environment.getProperty("app.origen.secreto-anterior")).isEmpty();
        assertThat(environment.getProperty("app.origen.encabezado")).isEqualTo(ENCABEZADO_DE_ORIGEN);
    }

    @Test
    void conOtroSecretoDeOrigen_403AntesQueCualquierOtraRegla() throws Exception {
        // El valor de la peticion reemplaza al de ComoSiLlegaraPorCloudflare.
        // /api/categorias es publica: el 403 no es de Spring Security.
        mockMvc.perform(get("/api/categorias")
                        .header(ENCABEZADO_DE_ORIGEN, "secreto-equivocado-de-prueba-0123456789"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Acceso denegado"));
        mockMvc.perform(get("/api/categorias")).andExpect(status().isOk());
    }

    @Test
    void conClasificacionHttp_elClasificadorEsElDelServicioDeInferencia() {
        assertThat(clasificador).isInstanceOf(InferenciaHttpAdapter.class);
        assertThat(clasificador.estaDisponible()).isTrue();
    }

    @Test
    void unConflictoDeNegocio_conservaSuMensaje() throws Exception {
        String email = "prod-" + UUID.randomUUID() + "@lima.pe";
        registrar(email).andExpect(status().isCreated());

        registrar(email)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message").value("El correo ya está registrado"))
                .andExpect(jsonPath("$.path").value("/api/auth/registro"));
    }

    @Test
    void elTokenFirmadoConElSecretoPropio_autentica() throws Exception {
        String email = "prod-" + UUID.randomUUID() + "@lima.pe";
        registrar(email).andExpect(status().isCreated());
        String token = confirmarEIniciarSesion(email, "secreta123");

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
