package pe.edu.upc.viasegura.common.security;

import java.time.Duration;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Configuracion de seguridad: API stateless protegida con JWT y
 * autorizacion basada en roles (CIUDADANO / FUNCIONARIO_MUNICIPAL / ADMIN).
 *
 * <p>{@code @EnableMethodSecurity} habilita {@code @PreAuthorize} en los
 * servicios/controladores para el resto de historias.</p>
 *
 * <p><strong>US-04 (cerrar sesion) es una decision deliberada, no un
 * descuido:</strong> no hay blacklist de tokens. El JWT expira a los
 * {@code security.jwt.expiration-minutes} (120 min por defecto); "cerrar
 * sesion" es responsabilidad del cliente (descarta el token). Un blacklist
 * (tabla/Redis consultada en cada request) reintroduce estado de servidor y
 * un lookup por request, anulando la ventaja de JWT stateless, solo para
 * un caso de uso de higiene de sesion (no de respuesta a compromiso de
 * cuenta, que igual requeriria rotar el secreto de firma). Consecuencia
 * aceptada: un dispositivo comprometido con sesion activa sigue siendo
 * valido hasta que el token expira. Detalle en README.md, seccion
 * "Decisiones de seguridad (alcance academico)".</p>
 */
@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final UserDetailsService userDetailsService;
    private final RestAuthenticationEntryPoint authenticationEntryPoint;
    private final RestAccessDeniedHandler accessDeniedHandler;
    private final TerminosAceptadosAuthorizationManager terminosAceptados;

    /** Rutas publicas: registro, login, documentacion y consultas publicas. */
    private static final String[] RUTAS_PUBLICAS = {
            "/api/auth/registro",
            "/api/auth/login",
            "/api/auth/recuperar-password",
            "/api/auth/restablecer-password",
            // Indice de desempeno distrital: transparencia ciudadana (US-18/US-20).
            // Ruta EXACTA, no wildcard: /api/desempeno/mi-distrito (US-17) es
            // interno del funcionario y debe exigir autenticacion (401 sin
            // token) antes de que @PreAuthorize evalue el rol.
            "/api/desempeno/distritos",
            "/v3/api-docs/**",
            "/swagger-ui/**",
            "/swagger-ui.html"
    };

    /**
     * CORS para la PWA (Next.js), que se despliega como proyecto
     * independiente en otro origen -- es parte de la arquitectura acordada
     * (backend API REST + frontend PWA separados), no un parche de
     * desarrollo.
     *
     * <p>{@code allowCredentials = false} a proposito: la autenticacion es
     * por bearer token en el header {@code Authorization}, no por cookie de
     * sesion. Habilitar credenciales obligaria a restringir aun mas los
     * origenes sin aportar nada, porque el navegador no tiene que enviar
     * ninguna cookie a este API.</p>
     *
     * <p>{@code Idempotency-Key} (US-06) viaja dentro de {@code "*"}: el
     * Service Worker lo agrega en los reintentos de sincronizacion offline y
     * debe sobrevivir al preflight.</p>
     *
     * <p>Se expone {@code Content-Disposition} (US-28): sin ello el navegador
     * oculta esa cabecera al frontend de otro origen y la exportacion se
     * descarga sin el nombre de archivo que arma el backend.</p>
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins}") List<String> allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(false);
        config.setExposedHeaders(List.of(HttpHeaders.CONTENT_DISPOSITION));
        // Cachea el preflight 1 h: evita un OPTIONS por request en el mapa,
        // que dispara muchas consultas al mover/hacer zoom (US-10).
        config.setMaxAge(Duration.ofHours(1));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // Debe ir antes que la autorizacion: el preflight OPTIONS
                // viaja sin Authorization y seria rechazado con 403.
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(RUTAS_PUBLICAS).permitAll()
                        // Healthcheck del despliegue (DEP-02): ruta EXACTA y
                        // solo GET. /actuator/health/{componente} y cualquier
                        // otro /actuator/** siguen exigiendo token, y ademas
                        // no estan expuestos (management.endpoints en
                        // application.yml).
                        .requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
                        // Lectura publica de comentarios (US-27); publicar si requiere auth.
                        .requestMatchers(HttpMethod.GET, "/api/reportes/*/comentarios").permitAll()
                        // Busqueda publica de reportes (US-12/US-10): misma info sin PII
                        // que ya es publica en el mapa/desempeno. Solo la raiz exacta
                        // (no /api/reportes/mis-reportes ni /{id}/*, que siguen protegidas).
                        .requestMatchers(HttpMethod.GET, "/api/reportes").permitAll()
                        // Detalle publico de UN reporte. El id se acota a digitos a
                        // proposito: un `/api/reportes/*` abriria tambien las rutas
                        // literales hermanas /mis-reportes, /bandeja y /exportar,
                        // que son privadas.
                        .requestMatchers(HttpMethod.GET, "/api/reportes/{id:[0-9]+}").permitAll()
                        // Densidad para el mapa de calor (US-11): agregado anonimo
                        // de la misma informacion publica que la busqueda. Ruta
                        // EXACTA y solo GET.
                        .requestMatchers(HttpMethod.GET, "/api/reportes/densidad").permitAll()
                        // Catalogos de referencia para poblar selectores y filtros
                        // (crear reporte US-05, mapa US-10, busqueda US-12). Publicos
                        // por el mismo criterio que la busqueda: un filtro publico cuyo
                        // catalogo exigiera token no tendria sentido, y no hay PII.
                        // Solo GET: el POST /api/categorias (US-29) sigue exigiendo
                        // token + rol FUNCIONARIO_MUNICIPAL.
                        .requestMatchers(HttpMethod.GET, "/api/categorias").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/distritos").permitAll()
                        // Resolucion de coordenadas -> distrito (US-05): misma
                        // informacion publica que el catalogo, y el formulario de
                        // reporte la necesita antes de que el ciudadano se
                        // autentique el envio.
                        .requestMatchers(HttpMethod.GET, "/api/distritos/por-coordenadas").permitAll()
                        // Fotos de evidencia de los reportes (US-05): publicas,
                        // porque el mapa y la busqueda (US-10/US-12) ya lo son y
                        // devuelven `fotoUrl`; con token serian imagenes rotas.
                        // Se abre SOLO el subdirectorio de reportes: las fotos de
                        // perfil viven en /media/fotos/perfiles y no se sirven como
                        // estatico, sino por /api/perfiles/fotos/{archivo}, que
                        // verifica al dueno (PerfilFotoController).
                        .requestMatchers(HttpMethod.GET, "/media/fotos/reportes/**").permitAll()
                        // Clave publica VAPID (US-21): el navegador la necesita
                        // para suscribirse a push; no identifica a nadie. Ruta
                        // exacta y solo GET (el resto de /api/notificaciones es
                        // privado).
                        .requestMatchers(HttpMethod.GET, "/api/notificaciones/vapid-public-key").permitAll()
                        // D-12: con los terminos pendientes solo se puede ver el
                        // propio perfil, gestionar los consentimientos y dar de
                        // baja la suscripcion push al cerrar sesion (el logout es
                        // del cliente, no hay endpoint). Rutas exactas.
                        .requestMatchers(HttpMethod.GET, "/api/auth/me").authenticated()
                        .requestMatchers("/api/auth/me/consentimientos",
                                "/api/auth/me/consentimientos/*").authenticated()
                        .requestMatchers(HttpMethod.DELETE, "/api/notificaciones/suscripciones").authenticated()
                        // Todo lo demas: autenticado y con los terminos vigentes
                        // aceptados; si faltan, 403 TERMINOS_PENDIENTES.
                        .anyRequest().access(terminosAceptados))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .authenticationProvider(authenticationProvider())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
