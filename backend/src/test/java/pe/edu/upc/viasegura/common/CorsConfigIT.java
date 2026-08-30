package pe.edu.upc.viasegura.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * CORS para la PWA (Next.js), que corre en otro origen.
 *
 * <p>Sin esto, el navegador bloquea toda llamada del frontend: el preflight
 * {@code OPTIONS} viaja sin cabecera {@code Authorization} y la cadena de
 * seguridad lo rechazaba con 403 antes de que el request real saliera.</p>
 */
class CorsConfigIT extends AbstractPostgisIT {

    private static final String ORIGEN_FRONTEND = "http://localhost:3000";

    @Autowired
    MockMvc mockMvc;

    @Test
    void preflightDesdeElFrontend_esAceptado() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                        .header("Origin", ORIGEN_FRONTEND)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGEN_FRONTEND));
    }

    @Test
    void preflightPermiteAuthorizationEIdempotencyKey() throws Exception {
        // El Service Worker reintenta la creacion de reportes con
        // Idempotency-Key (US-06): esa cabecera debe sobrevivir al preflight.
        mockMvc.perform(options("/api/reportes")
                        .header("Origin", ORIGEN_FRONTEND)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "authorization,idempotency-key"))
                .andExpect(status().isOk())
                .andExpect(header().stringValues("Access-Control-Allow-Headers",
                        org.hamcrest.Matchers.hasItem(
                                org.hamcrest.Matchers.containsStringIgnoringCase("idempotency-key"))));
    }

    @Test
    void origenNoPermitido_esRechazado() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                        .header("Origin", "http://atacante.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }

    @Test
    void requestRealDesdeElFrontend_llevaLaCabeceraDeOrigenPermitido() throws Exception {
        // El preflight no basta: la respuesta real tambien debe traer
        // Access-Control-Allow-Origin o el navegador descarta el cuerpo.
        mockMvc.perform(post("/api/auth/login")
                        .header("Origin", ORIGEN_FRONTEND)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nadie@lima.pe\",\"password\":\"incorrecta\"}"))
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGEN_FRONTEND));
    }

    @Test
    void metodosDeLaApiEstanPermitidos() throws Exception {
        for (HttpMethod metodo : new HttpMethod[]{
                HttpMethod.GET, HttpMethod.POST, HttpMethod.PATCH, HttpMethod.DELETE}) {
            mockMvc.perform(options("/api/reportes/1")
                            .header("Origin", ORIGEN_FRONTEND)
                            .header("Access-Control-Request-Method", metodo.name()))
                    .andExpect(status().isOk());
        }
    }
}
