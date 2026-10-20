package pe.edu.upc.viasegura.auth;

import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Tests de integracion de los endpoints de acceso (US-01, US-02). */
class AuthControllerIT extends AbstractPostgisIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;

    private String email() {
        return "user-" + UUID.randomUUID() + "@lima.pe";
    }

    private String registro(String email, String password) {
        return """
                {"email":"%s","password":"%s","nombre":"Ana","apellido":"Ruiz","aceptaTerminos":true,"versionTerminos":"2026-10-v1"}
                """.formatted(email, password);
    }

    @Test
    void registro_exitoso_devuelve201YTokenConRolCiudadano() throws Exception {
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(email(), "secreta123")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.tokenType", is("Bearer")))
                .andExpect(jsonPath("$.usuario.rol", is("CIUDADANO")));
    }

    @Test
    void registro_correoDuplicado_devuelve409() throws Exception {
        // US-01, Escenario 2: correo ya registrado.
        String correo = email();
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(correo, "secreta123")))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(correo, "secreta123")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status", is(409)));
    }

    @Test
    void registro_datosInvalidos_devuelve400ConDetalles() throws Exception {
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"no-es-email\",\"password\":\"123\",\"nombre\":\"\",\"apellido\":\"X\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.length()", greaterThan(0)));
    }

    @Test
    void login_credencialesValidas_devuelve200YToken() throws Exception {
        String correo = email();
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(correo, "secreta123")))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"secreta123\"}".formatted(correo)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.usuario.email", is(correo)));
    }

    @Test
    void login_contrasenaIncorrecta_devuelve401() throws Exception {
        // US-02, Escenario 2: credenciales incorrectas.
        String correo = email();
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(correo, "secreta123")))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"incorrecta\"}".formatted(correo)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void me_sinToken_devuelve401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void me_conToken_devuelve200YUsuarioAutenticado() throws Exception {
        String correo = email();
        MvcResult res = mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(correo, "secreta123")))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode body = objectMapper.readTree(res.getResponse().getContentAsString());
        String token = body.get("token").asText();

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email", is(correo)))
                .andExpect(jsonPath("$.rol", is("CIUDADANO")));
    }

    @Test
    void me_actualizaPreferenciaNotificacion_persisteYSeRefleja() throws Exception {
        // US-30 minimo: el ciudadano cambia su canal (default AMBAS -> EMAIL).
        String correo = email();
        MvcResult res = mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registro(correo, "secreta123")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.usuario.preferenciaNotificacion", is("AMBAS")))
                .andReturn();
        String token = objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();

        mockMvc.perform(patch("/api/auth/me/preferencia-notificacion")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preferenciaNotificacion\":\"EMAIL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferenciaNotificacion", is("EMAIL")));

        // Persistio: /me lo refleja en una peticion nueva.
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferenciaNotificacion", is("EMAIL")));
    }

    @Test
    void me_actualizaPreferencia_sinToken_devuelve401() throws Exception {
        mockMvc.perform(patch("/api/auth/me/preferencia-notificacion")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preferenciaNotificacion\":\"EMAIL\"}"))
                .andExpect(status().isUnauthorized());
    }
}
