package pe.edu.upc.viasegura.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.security.SecurityProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.core.Ordered;
import org.springframework.mock.env.MockEnvironment;

/**
 * Cuando se registra el filtro del encabezado de origen (DEP-14), en que
 * lugar de la cadena y que deja en el log. El arranque real con el perfil
 * {@code prod} lo prueban {@code ArranqueEncabezadoDeOrigenIT} y
 * {@code EncabezadoDeOrigenIT}.
 */
class EncabezadoDeOrigenConfigTest {

    private static final String SECRETO = "secreto-de-prueba-0123456789-abcdefghij";
    private static final String SECRETO_ANTERIOR = "secreto-anterior-de-prueba-0123456789-xyz";

    private static MockEnvironment entorno(String secreto, String... perfiles) {
        MockEnvironment entorno = new MockEnvironment();
        if (secreto != null) {
            entorno.setProperty(EncabezadoDeOrigenConfig.PROPIEDAD_SECRETO, secreto);
        }
        entorno.setActiveProfiles(perfiles);
        return entorno;
    }

    /** Lo que registra {@code EncabezadoDeOrigenConfig} mientras corre {@code accion}. */
    private static List<ILoggingEvent> registroDe(Runnable accion) {
        Logger logger = (Logger) LoggerFactory.getLogger(EncabezadoDeOrigenConfig.class);
        Level nivelPrevio = logger.getLevel();
        ListAppender<ILoggingEvent> registro = new ListAppender<>();
        registro.start();
        logger.addAppender(registro);
        logger.setLevel(Level.INFO);
        try {
            accion.run();
        } finally {
            logger.detachAppender(registro);
            logger.setLevel(nivelPrevio);
        }
        return registro.list;
    }

    @ParameterizedTest
    @ValueSource(strings = {"ninguno", "NINGUNO", "Ninguno"})
    void conNinguno_noSeExige(String valor) {
        assertThat(EncabezadoDeOrigenConfig.estaExigido(entorno(valor))).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {SECRETO, "ninguno ", " ninguno", "ninguna", "falso", ""})
    void conCualquierOtroValor_seExige(String valor) {
        // Con un valor que no sirve, se exige y el filtro no se puede construir:
        // la app no arranca, en vez de quedar sin la validacion.
        assertThat(EncabezadoDeOrigenConfig.estaExigido(entorno(valor))).isTrue();
    }

    @Test
    void sinLaPropiedad_seExige() {
        assertThat(EncabezadoDeOrigenConfig.estaExigido(entorno(null))).isTrue();
    }

    @Test
    void conLaVariableSinDefinir_fallaNombrandola() {
        // Lo que pasa en prod sin ORIGEN_SECRETO: application-prod.yml dice
        // ${ORIGEN_SECRETO}, sin valor por defecto.
        assertThatThrownBy(() -> EncabezadoDeOrigenConfig.estaExigido(entorno("${ORIGEN_SECRETO}")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Could not resolve placeholder 'ORIGEN_SECRETO'");
    }

    @Test
    void elFiltro_vaPrimero_antesQueSpringSecurity() {
        FilterRegistrationBean<EncabezadoDeOrigenFilter> registro = new EncabezadoDeOrigenConfig(entorno(SECRETO))
                .encabezadoDeOrigenFilter("X-Origen-Secreto", SECRETO, "", new ObjectMapper());

        assertThat(registro.getOrder()).isEqualTo(Ordered.HIGHEST_PRECEDENCE)
                .isLessThan(SecurityProperties.DEFAULT_FILTER_ORDER);
        assertThat(registro.getUrlPatterns()).containsExactly("/*");
        assertThat(registro.isEnabled()).isTrue();
        assertThat(registro.getFilter().encabezado()).isEqualTo("X-Origen-Secreto");
    }

    @Test
    void exigido_loDiceEnElLog_sinElSecreto() {
        List<ILoggingEvent> lineas = registroDe(() -> new EncabezadoDeOrigenConfig(entorno(SECRETO, "prod"))
                .encabezadoDeOrigenFilter("X-Origen-Secreto", SECRETO, "", new ObjectMapper()));

        assertThat(lineas).singleElement().satisfies(linea -> {
            assertThat(linea.getLevel()).isEqualTo(Level.INFO);
            assertThat(linea.getFormattedMessage())
                    .startsWith("Encabezado de origen exigido (DEP-14): sin X-Origen-Secreto valido, 403")
                    .doesNotContain(SECRETO);
        });
    }

    @Test
    void enUnaRotacion_avisaQueHayQueBorrarElAnterior_sinLosSecretos() {
        List<ILoggingEvent> lineas = registroDe(() -> new EncabezadoDeOrigenConfig(entorno(SECRETO, "prod"))
                .encabezadoDeOrigenFilter("X-Origen-Secreto", SECRETO, SECRETO_ANTERIOR, new ObjectMapper()));

        assertThat(lineas).hasSize(2);
        assertThat(lineas.get(1).getLevel()).isEqualTo(Level.WARN);
        assertThat(lineas.get(1).getFormattedMessage()).startsWith("Se acepta tambien ORIGEN_SECRETO_ANTERIOR");
        assertThat(lineas).allSatisfy(linea ->
                assertThat(linea.getFormattedMessage()).doesNotContain(SECRETO, SECRETO_ANTERIOR));
    }

    @Test
    void apagadoEnProd_dejaUnWarn() {
        List<ILoggingEvent> lineas = registroDe(() -> new EncabezadoDeOrigenConfig(entorno("ninguno", "prod")));

        assertThat(lineas).singleElement().satisfies(linea -> {
            assertThat(linea.getLevel()).isEqualTo(Level.WARN);
            assertThat(linea.getFormattedMessage()).startsWith("Encabezado de origen APAGADO");
        });
    }

    @Test
    void apagadoFueraDeProd_noDejaNada() {
        // En local y en los tests es lo normal: no hay Cloudflare delante.
        assertThat(registroDe(() -> new EncabezadoDeOrigenConfig(entorno("ninguno", "local")))).isEmpty();
        assertThat(registroDe(() -> new EncabezadoDeOrigenConfig(entorno("ninguno")))).isEmpty();
    }
}
