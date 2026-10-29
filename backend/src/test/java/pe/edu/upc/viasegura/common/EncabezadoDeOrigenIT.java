package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * El API solo atiende lo que pasa por Cloudflare (DEP-14), con la
 * configuracion de {@code prod}.
 *
 * <p>Cloudflare agrega {@code X-Origen-Secreto} con el secreto a cada
 * peticion que pasa por su proxy (una <i>Request Header Transform Rule</i>).
 * Quien envia la peticion directo al borde de Railway, con
 * {@code Host: api.ciudadviva.app}, no lo tiene: recibe 403 en cualquier
 * ruta, publica o no, antes de que la peticion llegue a Spring Security. La
 * unica excepcion es {@code GET /actuator/health}, el health check de
 * Railway, que entra directo.</p>
 *
 * <p>La configuracion es la de una rotacion en curso: se aceptan el secreto
 * vigente y el anterior. {@code PerfilProdIT} prueba el caso normal, con un
 * solo secreto, y que con el encabezado el API funciona igual.</p>
 */
@ActiveProfiles("prod")
@TestPropertySource(properties = {
        "CORS_ALLOWED_ORIGINS=" + EncabezadoDeOrigenIT.ORIGEN_PWA,
        "FOTOS_ALMACEN=local",
        "CORREO_TIPO=smtp",
        "NOTIF_FROM=Ciudad Viva <no-reply@ciudadviva.test>",
        "CAPTCHA_TIPO=ninguno",
        "CLASIFICACION_TIPO=falso",
        // DEP-14: valores de prueba evidentes, por las variables del despliegue.
        "ORIGEN_SECRETO=" + EncabezadoDeOrigenIT.SECRETO,
        "ORIGEN_SECRETO_ANTERIOR=" + EncabezadoDeOrigenIT.SECRETO_ANTERIOR})
class EncabezadoDeOrigenIT extends AbstractPostgisIT {

    static final String ORIGEN_PWA = "https://pwa.ciudadviva.test";
    static final String ENCABEZADO = "X-Origen-Secreto";
    static final String SECRETO = "secreto-de-origen-de-prueba-0123456789";
    static final String SECRETO_ANTERIOR = "secreto-de-origen-anterior-de-prueba-0123456789";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;

    @DynamicPropertySource
    static void secretoJwtDeProduccion(DynamicPropertyRegistry registry) {
        // En prod no se acepta el secreto JWT de desarrollo (SEC-03).
        byte[] clave = new byte[48];
        new SecureRandom().nextBytes(clave);
        registry.add("security.jwt.secret", () -> Base64.getEncoder().encodeToString(clave));
    }

    private ObjectNode cuerpoSinFecha(MockHttpServletRequestBuilder peticion) throws Exception {
        String cuerpo = mockMvc.perform(peticion).andReturn().getResponse().getContentAsString();
        ObjectNode json = (ObjectNode) objectMapper.readTree(cuerpo);
        json.remove("timestamp");
        return json;
    }

    @Test
    void sinElEncabezado_unaRutaPublica_403ConElCuerpoDeCualquier403() throws Exception {
        mockMvc.perform(get("/api/categorias"))
                .andExpect(status().isForbidden())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.error").value("Forbidden"))
                .andExpect(jsonPath("$.message").value("Acceso denegado"))
                .andExpect(jsonPath("$.path").value("/api/categorias"))
                .andExpect(jsonPath("$.codigo").doesNotExist());
    }

    @Test
    void conUnValorEquivocado_elMismo403QueSinElEncabezado() throws Exception {
        ObjectNode sinEncabezado = cuerpoSinFecha(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content("{}"));
        ObjectNode equivocado = cuerpoSinFecha(post("/api/auth/login")
                .header(ENCABEZADO, "secreto-equivocado-de-prueba-0123456789")
                .contentType(MediaType.APPLICATION_JSON).content("{}"));

        assertThat(equivocado).isEqualTo(sinEncabezado);
        assertThat(equivocado.get("status").asInt()).isEqualTo(403);
    }

    @ParameterizedTest
    @ValueSource(strings = {SECRETO, SECRETO_ANTERIOR})
    void conElSecretoVigenteOElAnterior_pasa(String secreto) throws Exception {
        mockMvc.perform(get("/api/categorias").header(ENCABEZADO, secreto))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void conElEncabezado_unaRutaPrivadaSigueExigiendoToken() throws Exception {
        // El encabezado de origen no autentica a nadie: solo deja llegar a la app.
        mockMvc.perform(get("/api/auth/me").header(ENCABEZADO, SECRETO))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void elHealthcheck_respondeSinElEncabezado() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    /**
     * Ninguna otra ruta queda exenta: ni otro metodo sobre el health, ni otra
     * ruta de Actuator, ni el preflight CORS, ni las fotos publicas, ni el
     * {@code /error}. Todo eso tambien pasa por Cloudflare y trae el
     * encabezado.
     */
    static Stream<Arguments> sinElEncabezadoNoPasan() {
        return Stream.of(
                Arguments.of(head("/actuator/health")),
                Arguments.of(post("/actuator/health")),
                Arguments.of(get("/actuator/health/db")),
                Arguments.of(get("/actuator/env")),
                Arguments.of(preflight()),
                Arguments.of(get("/media/fotos/reportes/0b7c8b5e-2f3a-4c55-9d6e-1a2b3c4d5e6f.jpg")),
                Arguments.of(get("/api/reportes")),
                Arguments.of(get("/api/distritos/por-coordenadas")
                        .param("latitud", "-12.12").param("longitud", "-77.03")),
                Arguments.of(get("/error")));
    }

    @ParameterizedTest
    @MethodSource
    void sinElEncabezadoNoPasan(MockHttpServletRequestBuilder peticion) throws Exception {
        mockMvc.perform(peticion)
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    private static MockHttpServletRequestBuilder preflight() {
        return options("/api/reportes")
                .header(HttpHeaders.ORIGIN, ORIGEN_PWA)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type");
    }

    @Test
    void elPreflightCors_conElEncabezado_sigueFuncionando() throws Exception {
        mockMvc.perform(preflight().header(ENCABEZADO, SECRETO))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGEN_PWA));
    }

    @Test
    void unaFotoDeReporte_conElEncabezado_llegaAlAlmacen() throws Exception {
        // 404 del resource handler (no existe), no el 403 del filtro.
        mockMvc.perform(get("/media/fotos/reportes/0b7c8b5e-2f3a-4c55-9d6e-1a2b3c4d5e6f.jpg")
                        .header(ENCABEZADO, SECRETO))
                .andExpect(status().isNotFound());
    }

    @Test
    void elNombreDelEncabezado_noDistingueMayusculas() throws Exception {
        // Por HTTP/2 los nombres llegan en minusculas.
        mockMvc.perform(request(HttpMethod.GET, "/api/categorias").header("x-origen-secreto", SECRETO))
                .andExpect(status().isOk());
    }
}
