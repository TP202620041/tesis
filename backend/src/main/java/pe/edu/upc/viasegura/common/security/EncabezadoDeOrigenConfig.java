package pe.edu.upc.viasegura.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.core.type.AnnotatedTypeMetadata;

/**
 * Registra {@link EncabezadoDeOrigenFilter} (DEP-14) con la maxima
 * precedencia, antes que Spring Security, cuando {@code app.origen.secreto}
 * no es {@code ninguno}.
 *
 * <ul>
 *   <li><b>Fuera de {@code prod}</b> vale {@code ninguno} por defecto
 *   ({@code application.yml}) y el filtro no se registra: en local y en los
 *   tests no hay Cloudflare delante.</li>
 *   <li><b>En {@code prod}</b> es {@code ${ORIGEN_SECRETO}}, obligatoria y sin
 *   valor por defecto: sin ella el arranque falla al evaluar {@link Exigido}
 *   («Could not resolve placeholder 'ORIGEN_SECRETO'»), antes de crear ningun
 *   bean. Con un valor que no sirve, falla al construir el filtro, junto con
 *   el servidor web y antes de conectarse a la base.</li>
 *   <li><b>{@code ORIGEN_SECRETO=ninguno}</b> es el interruptor para apagarlo
 *   a proposito, como {@code CAPTCHA_TIPO=ninguno} o
 *   {@code CLASIFICACION_TIPO=falso}: por ejemplo, si hubiera que sacar el
 *   proxy de Cloudflare durante un incidente. En {@code prod} deja un WARN en
 *   cada arranque. Se compara como las otras: sin distinguir mayusculas y sin
 *   recortar espacios ({@code "ninguno "} es un secreto, corto, y no
 *   arranca).</li>
 * </ul>
 *
 * <p>Se registra con un {@link FilterRegistrationBean} y no como
 * {@code @Component}: asi tiene la maxima precedencia, va antes que la cadena
 * de Spring Security ({@code -100}) y no queda registrado dos veces.</p>
 */
@Configuration
public class EncabezadoDeOrigenConfig {

    static final String PROPIEDAD_SECRETO = "app.origen.secreto";
    static final String APAGADO = "ninguno";

    private static final Logger log = LoggerFactory.getLogger(EncabezadoDeOrigenConfig.class);

    public EncabezadoDeOrigenConfig(Environment entorno) {
        if (!estaExigido(entorno) && entorno.acceptsProfiles(Profiles.of("prod"))) {
            log.warn("Encabezado de origen APAGADO (ORIGEN_SECRETO=ninguno, DEP-14): el API atiende tambien las"
                    + " peticiones que no pasan por Cloudflare, sin su WAF ni su limite de peticiones.");
        }
    }

    @Bean
    @Conditional(Exigido.class)
    public FilterRegistrationBean<EncabezadoDeOrigenFilter> encabezadoDeOrigenFilter(
            @Value("${app.origen.encabezado}") String encabezado,
            @Value("${" + PROPIEDAD_SECRETO + "}") String secreto,
            @Value("${app.origen.secreto-anterior:}") String secretoAnterior,
            ObjectMapper objectMapper) {
        EncabezadoDeOrigenFilter filtro =
                new EncabezadoDeOrigenFilter(encabezado, secreto, secretoAnterior, objectMapper);
        log.info("Encabezado de origen exigido (DEP-14): sin {} valido, 403; solo queda exento GET {}.",
                filtro.encabezado(), EncabezadoDeOrigenFilter.RUTA_HEALTHCHECK);
        if (filtro.aceptaSecretoAnterior()) {
            log.warn("Se acepta tambien ORIGEN_SECRETO_ANTERIOR: es una rotacion en curso. Cuando la Transform Rule"
                    + " de Cloudflare envie el secreto nuevo, borre la variable y vuelva a desplegar.");
        }
        FilterRegistrationBean<EncabezadoDeOrigenFilter> registro = new FilterRegistrationBean<>(filtro);
        registro.setName("encabezadoDeOrigenFilter");
        registro.setOrder(Ordered.HIGHEST_PRECEDENCE);
        registro.addUrlPatterns("/*");
        return registro;
    }

    /** Sin la propiedad, o con cualquier valor distinto de {@code ninguno}: exigido. */
    static boolean estaExigido(Environment entorno) {
        return !APAGADO.equalsIgnoreCase(entorno.getProperty(PROPIEDAD_SECRETO));
    }

    /** Condicion del registro: el filtro existe solo si esta exigido. */
    static final class Exigido implements Condition {

        @Override
        public boolean matches(ConditionContext contexto, AnnotatedTypeMetadata metadatos) {
            return estaExigido(contexto.getEnvironment());
        }
    }
}
