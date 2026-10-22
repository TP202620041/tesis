package pe.edu.upc.viasegura.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Healthcheck del despliegue (DEP-02).
 *
 * <p>{@code GET /actuator/health} es la unica ruta de Actuator: publica (la
 * consulta la plataforma sin token), sin detalles que revelen la BD o las
 * versiones, y exacta. El resto de Actuator no esta expuesto: ni siquiera un
 * ADMIN lo alcanza, porque {@code /actuator/env} o {@code /actuator/heapdump}
 * entregarian secretos (el JWT, la contrasena de la BD).</p>
 */
class ActuatorHealthIT extends AbstractPostgisIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;

    private String tokenDeAdmin() {
        Usuario admin = guardarConTerminos(Usuario.builder()
                .email("admin-health-" + UUID.randomUUID() + "@viasegura.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Admin").apellido("Plataforma").rol(Rol.ADMIN).build());
        return jwtService.generarToken(admin.getEmail(), admin.getRol().name());
    }

    @Test
    void healthSinToken_200UpSinDetalles() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(jsonPath("$.details").doesNotExist())
                // Exactamente {"status":"UP"}: nada mas que el estado.
                .andExpect(content().json("{\"status\":\"UP\"}", true));
    }

    @Test
    void healthPorPost_noEsPublico() throws Exception {
        // La ruta publica es solo GET (regla de SecurityConfig).
        mockMvc.perform(post("/actuator/health"))
                .andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/actuator", "/actuator/env", "/actuator/configprops", "/actuator/beans", "/actuator/heapdump",
            "/actuator/threaddump", "/actuator/loggers", "/actuator/mappings", "/actuator/metrics",
            "/actuator/info", "/actuator/health/db", "/actuator/health/diskSpace"})
    void otrasRutasDeActuator_sinToken_401(String ruta) throws Exception {
        mockMvc.perform(get(ruta))
                .andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/actuator", "/actuator/env", "/actuator/configprops", "/actuator/beans", "/actuator/heapdump",
            "/actuator/threaddump", "/actuator/loggers", "/actuator/mappings", "/actuator/metrics",
            "/actuator/info"})
    void otrasRutasDeActuator_niSiquieraUnAdmin_404(String ruta) throws Exception {
        // No es que esten protegidas: no estan expuestas en absoluto.
        mockMvc.perform(get(ruta).header("Authorization", "Bearer " + tokenDeAdmin()))
                .andExpect(status().isNotFound());
    }
}
