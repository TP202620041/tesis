package pe.edu.upc.viasegura.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * El filtro del encabezado de origen (DEP-14), sin Spring: que deja pasar,
 * que rechaza, con que cuerpo, y que no arranca con un secreto que no sirve.
 * El IT con el perfil {@code prod} es {@code EncabezadoDeOrigenIT}.
 */
class EncabezadoDeOrigenFilterTest {

    private static final String ENCABEZADO = "X-Origen-Secreto";
    /** Valores de prueba evidentes, de 39 y 41 caracteres. */
    private static final String SECRETO = "secreto-de-prueba-0123456789-abcdefghij";
    private static final String SECRETO_ANTERIOR = "secreto-anterior-de-prueba-0123456789-xyz";

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    private EncabezadoDeOrigenFilter filtro() {
        return new EncabezadoDeOrigenFilter(ENCABEZADO, SECRETO, "", objectMapper);
    }

    private EncabezadoDeOrigenFilter filtroEnRotacion() {
        return new EncabezadoDeOrigenFilter(ENCABEZADO, SECRETO, SECRETO_ANTERIOR, objectMapper);
    }

    private static MockHttpServletRequest peticion(String metodo, String uri) {
        return new MockHttpServletRequest(metodo, uri);
    }

    /** Pasa la peticion por el filtro y devuelve si llego al resto de la cadena. */
    private static boolean llegaAlResto(EncabezadoDeOrigenFilter filtro, MockHttpServletRequest peticion,
                                        MockHttpServletResponse respuesta) throws Exception {
        MockFilterChain cadena = new MockFilterChain();
        filtro.doFilter(peticion, respuesta, cadena);
        return cadena.getRequest() != null;
    }

    private JsonNode cuerpo(MockHttpServletResponse respuesta) throws Exception {
        return objectMapper.readTree(respuesta.getContentAsString());
    }

    // --- Lo que pasa ---

    @Test
    void conElSecretoVigente_pasa() throws Exception {
        MockHttpServletRequest peticion = peticion("GET", "/api/categorias");
        peticion.addHeader(ENCABEZADO, SECRETO);
        MockHttpServletResponse respuesta = new MockHttpServletResponse();

        assertThat(llegaAlResto(filtro(), peticion, respuesta)).isTrue();
        assertThat(respuesta.getStatus()).isEqualTo(200);
        assertThat(respuesta.getContentAsString()).isEmpty();
    }

    @Test
    void elNombreDelEncabezado_noDistingueMayusculas() throws Exception {
        // HTTP/2 lo envia en minusculas; el valor si se compara exacto.
        MockHttpServletRequest peticion = peticion("POST", "/api/reportes");
        peticion.addHeader("x-origen-secreto", SECRETO);

        assertThat(llegaAlResto(filtro(), peticion, new MockHttpServletResponse())).isTrue();
    }

    @Test
    void enUnaRotacion_pasanElVigenteYElAnterior() throws Exception {
        EncabezadoDeOrigenFilter filtro = filtroEnRotacion();
        assertThat(filtro.aceptaSecretoAnterior()).isTrue();

        for (String valor : new String[] {SECRETO, SECRETO_ANTERIOR}) {
            MockHttpServletRequest peticion = peticion("GET", "/api/categorias");
            peticion.addHeader(ENCABEZADO, valor);
            assertThat(llegaAlResto(filtro, peticion, new MockHttpServletResponse())).isTrue();
        }
    }

    @Test
    void elHealthcheck_pasaSinEncabezado() throws Exception {
        MockHttpServletResponse respuesta = new MockHttpServletResponse();

        assertThat(llegaAlResto(filtro(), peticion("GET", "/actuator/health"), respuesta)).isTrue();
        assertThat(respuesta.getStatus()).isEqualTo(200);
    }

    @Test
    void elHealthcheck_conContextPath_pasaSinEncabezado() throws Exception {
        MockHttpServletRequest peticion = peticion("GET", "/raiz/actuator/health");
        peticion.setContextPath("/raiz");

        assertThat(llegaAlResto(filtro(), peticion, new MockHttpServletResponse())).isTrue();
    }

    @Test
    void unPrefijoQueArmaLaRutaDelHealthcheck_noQuedaExento() throws Exception {
        // Lo que dejaria un X-Forwarded-Prefix: /actuator ya aplicado por el
        // ForwardedHeaderFilter. Spring despacharia /health, no el health check.
        MockHttpServletRequest peticion = peticion("GET", "/actuator/health");
        peticion.setContextPath("/actuator");

        assertThat(llegaAlResto(filtro(), peticion, new MockHttpServletResponse())).isFalse();
    }

    // --- Lo que no pasa ---

    @Test
    void sinElEncabezado_403ConElCuerpoDeCualquier403() throws Exception {
        MockHttpServletResponse respuesta = new MockHttpServletResponse();

        assertThat(llegaAlResto(filtro(), peticion("GET", "/api/categorias"), respuesta)).isFalse();
        assertThat(respuesta.getStatus()).isEqualTo(403);
        assertThat(respuesta.getContentType()).isEqualTo("application/json");
        JsonNode cuerpo = cuerpo(respuesta);
        assertThat(cuerpo.get("status").asInt()).isEqualTo(403);
        assertThat(cuerpo.get("error").asText()).isEqualTo("Forbidden");
        assertThat(cuerpo.get("message").asText()).isEqualTo("Acceso denegado");
        assertThat(cuerpo.get("path").asText()).isEqualTo("/api/categorias");
        assertThat(cuerpo.get("details")).isEmpty();
        assertThat(cuerpo.has("codigo")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            "otro",
            // Un caracter de mas o de menos.
            SECRETO + "x",
            "secreto-de-prueba-0123456789-abcdefghi",
            // Otra capitalizacion, espacios alrededor, un caracter no ASCII.
            "SECRETO-DE-PRUEBA-0123456789-ABCDEFGHIJ",
            " " + SECRETO,
            SECRETO + " ",
            "secreto-de-prueba-0123456789-abcdefghíj",
            // El anterior, cuando no hay una rotacion en curso.
            SECRETO_ANTERIOR})
    void conUnValorQueNoEsElSecreto_403(String valor) throws Exception {
        MockHttpServletRequest peticion = peticion("GET", "/api/categorias");
        peticion.addHeader(ENCABEZADO, valor);
        MockHttpServletResponse respuesta = new MockHttpServletResponse();

        assertThat(llegaAlResto(filtro(), peticion, respuesta)).isFalse();
        assertThat(respuesta.getStatus()).isEqualTo(403);
    }

    @Test
    void conElSecretoEnOtroEncabezado_403() throws Exception {
        MockHttpServletRequest peticion = peticion("GET", "/api/categorias");
        peticion.addHeader("X-Origen", SECRETO);
        peticion.addHeader("Authorization", "Bearer " + SECRETO);

        assertThat(llegaAlResto(filtro(), peticion, new MockHttpServletResponse())).isFalse();
    }

    @Test
    void sinEncabezadoYConUnValorEquivocado_elMismoCuerpo_sinPistas() throws Exception {
        MockHttpServletResponse sinEncabezado = new MockHttpServletResponse();
        llegaAlResto(filtro(), peticion("POST", "/api/auth/login"), sinEncabezado);
        MockHttpServletRequest conOtroValor = peticion("POST", "/api/auth/login");
        conOtroValor.addHeader(ENCABEZADO, "secreto-equivocado-0123456789-abcdefghij");
        MockHttpServletResponse equivocado = new MockHttpServletResponse();
        llegaAlResto(filtro(), conOtroValor, equivocado);

        ObjectNode a = (ObjectNode) cuerpo(sinEncabezado);
        ObjectNode b = (ObjectNode) cuerpo(equivocado);
        a.remove("timestamp");
        b.remove("timestamp");
        assertThat(a).isEqualTo(b);
        assertThat(sinEncabezado.getHeaderNames()).isEqualTo(equivocado.getHeaderNames());
        // Nada que diga que se exige, ni como se llama, ni quien lo pone.
        assertThat(sinEncabezado.getContentAsString().toLowerCase())
                .doesNotContain("origen", "secreto", "cloudflare", "encabezado", "header");
    }

    /**
     * Solo {@code GET /actuator/health} exacto queda exento: ni otro metodo, ni
     * otra ruta de Actuator, ni una variante de la misma, ni el preflight CORS,
     * ni las fotos publicas, ni el {@code /error} pedido directo.
     */
    @ParameterizedTest
    @CsvSource({
            "HEAD, /actuator/health",
            "POST, /actuator/health",
            "OPTIONS, /actuator/health",
            "GET, /actuator/health/",
            "GET, /actuator/health/db",
            "GET, /actuator/healthz",
            "GET, /actuator/%68ealth",
            "GET, /actuator/./health",
            "GET, //actuator/health",
            "GET, /actuator/health;x=1",
            "GET, /actuator/env",
            "OPTIONS, /api/reportes",
            "GET, /media/fotos/reportes/0b7c8b5e-2f3a-4c55-9d6e-1a2b3c4d5e6f.jpg",
            "GET, /error",
            "GET, /"})
    void soloElHealthcheckExacto_quedaExento(String metodo, String uri) throws Exception {
        MockHttpServletResponse respuesta = new MockHttpServletResponse();

        assertThat(llegaAlResto(filtro(), peticion(metodo, uri), respuesta)).isFalse();
        assertThat(respuesta.getStatus()).isEqualTo(403);
    }

    @Test
    void elRechazo_noRegistraElValorRecibidoNiElSecreto() throws Exception {
        MockHttpServletRequest peticion = peticion("GET", "/api/categorias");
        String recibido = "valor-recibido-que-no-debe-quedar-en-el-log";
        peticion.addHeader(ENCABEZADO, recibido);

        Logger logger = (Logger) LoggerFactory.getLogger(EncabezadoDeOrigenFilter.class);
        Level nivelPrevio = logger.getLevel();
        ListAppender<ILoggingEvent> registro = new ListAppender<>();
        registro.start();
        logger.addAppender(registro);
        logger.setLevel(Level.DEBUG);
        try {
            llegaAlResto(filtroEnRotacion(), peticion, new MockHttpServletResponse());
        } finally {
            logger.detachAppender(registro);
            logger.setLevel(nivelPrevio);
        }

        List<String> lineas = registro.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
        // La linea existe (en DEBUG), asi que lo que falta en ella prueba algo.
        assertThat(lineas).containsExactly("403 por el encabezado de origen: GET /api/categorias");
        assertThat(String.join("\n", lineas)).doesNotContain(recibido, SECRETO, SECRETO_ANTERIOR);
    }

    // --- Arranque: valores que no sirven ---

    @ParameterizedTest
    @NullAndEmptySource
    void sinSecreto_noArranca(String secreto) {
        assertThatThrownBy(() -> new EncabezadoDeOrigenFilter(ENCABEZADO, secreto, "", objectMapper))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("ORIGEN_SECRETO esta vacia.")
                .hasMessageContaining("ORIGEN_SECRETO=ninguno")
                .hasMessageContaining("openssl rand -hex 32");
    }

    @Test
    void conUnSecretoDe31Caracteres_noArrancaNiDiceElValor() {
        String corto = "secreto-corto-de-prueba-0123456";
        assertThat(corto).hasSize(EncabezadoDeOrigenFilter.LONGITUD_MINIMA - 1);

        assertThatThrownBy(() -> new EncabezadoDeOrigenFilter(ENCABEZADO, corto, "", objectMapper))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("ORIGEN_SECRETO es demasiado corto: se exigen al menos 32 caracteres.")
                .hasMessageContaining("ORIGEN_SECRETO=ninguno")
                .message().doesNotContain(corto, "31");
    }

    @Test
    void conUnSecretoDe32Caracteres_arranca() {
        String justo = "secreto-justo-de-prueba-01234567";
        assertThat(justo).hasSize(EncabezadoDeOrigenFilter.LONGITUD_MINIMA);

        assertThat(new EncabezadoDeOrigenFilter(ENCABEZADO, justo, null, objectMapper).aceptaSecretoAnterior())
                .isFalse();
    }

    @Test
    void ningunoConEspacio_esUnSecretoCorto_yNoArranca() {
        // El interruptor se compara sin recortar espacios (EncabezadoDeOrigenConfig).
        assertThatThrownBy(() -> new EncabezadoDeOrigenFilter(ENCABEZADO, "ninguno ", "", objectMapper))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("demasiado corto");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "secreto de prueba con espacios 0123456789",
            "secreto-de-prueba-con-salto-de-linea-0123\n",
            "\tsecreto-de-prueba-con-tabulador-0123456789",
            "secreto-de-prueba-con-eñe-0123456789-abcdef"})
    void conCaracteresQueNoSonAsciiVisibles_noArrancaNiDiceElValor(String secreto) {
        assertThatThrownBy(() -> new EncabezadoDeOrigenFilter(ENCABEZADO, secreto, "", objectMapper))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("ORIGEN_SECRETO solo admite caracteres ASCII visibles")
                .message().doesNotContain(secreto.strip());
    }

    @Test
    void conUnSecretoAnteriorCorto_noArrancaYNombraLaVariable() {
        String corto = "anterior-corto-de-prueba";
        assertThatThrownBy(() -> new EncabezadoDeOrigenFilter(ENCABEZADO, SECRETO, corto, objectMapper))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("ORIGEN_SECRETO_ANTERIOR es demasiado corto")
                // El interruptor es solo para ORIGEN_SECRETO.
                .message().doesNotContain("ninguno", corto);
    }

    @Test
    void conElAnteriorIgualAlVigente_noArranca() {
        assertThatThrownBy(() -> new EncabezadoDeOrigenFilter(ENCABEZADO, SECRETO, SECRETO, objectMapper))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("ORIGEN_SECRETO_ANTERIOR es igual a ORIGEN_SECRETO")
                .message().doesNotContain(SECRETO);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"X Origen", "X-Origen:", "X_Origen", "X-Origen-Ñ"})
    void conUnNombreDeEncabezadoQueNoSirve_noArranca(String encabezado) {
        assertThatThrownBy(() -> new EncabezadoDeOrigenFilter(encabezado, SECRETO, "", objectMapper))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("app.origen.encabezado debe ser un nombre de encabezado HTTP");
    }
}
