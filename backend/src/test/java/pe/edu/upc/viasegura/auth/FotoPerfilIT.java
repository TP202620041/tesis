package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * La foto de perfil (US-30) solo la puede ver su dueno.
 *
 * <p>Contrapartida de {@link pe.edu.upc.viasegura.reportes.FotoReporteIT}: la
 * foto de un reporte es evidencia publica, la de un perfil es un dato
 * personal. Aqui se verifica que esa distincion se sostiene de verdad.</p>
 */
class FotoPerfilIT extends AbstractPostgisIT {

    private static final byte[] PNG_1X1 = java.util.Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;

    private String tokenCiudadano() throws Exception {
        MvcResult res = mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"perfil-%s@lima.pe","password":"secreta123","nombre":"Ana","apellido":"Vecina","aceptaTerminos":true,"versionTerminos":"%s"}
                                """.formatted(UUID.randomUUID(), versionTerminos)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
    }

    /** Sube una foto de perfil y devuelve la `fotoUrl` registrada. */
    private String subirFotoDePerfil(String token) throws Exception {
        MvcResult res = mockMvc.perform(multipart(HttpMethod.PATCH, "/api/auth/me")
                        .file(new MockMultipartFile("foto", "yo.png", "image/png", PNG_1X1))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("fotoUrl").asText();
    }

    @Test
    void elDuenoDescargaSuPropiaFoto() throws Exception {
        String token = tokenCiudadano();
        String fotoUrl = subirFotoDePerfil(token);

        // Debe apuntar al endpoint autenticado, NO al directorio publico.
        assertThat(fotoUrl).startsWith("/api/perfiles/fotos/");
        assertThat(fotoUrl).doesNotContain("/media/");

        MvcResult descarga = mockMvc.perform(get(fotoUrl).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andReturn();
        assertThat(descarga.getResponse().getContentAsByteArray()).isEqualTo(PNG_1X1);
    }

    @Test
    void sinToken_401() throws Exception {
        String fotoUrl = subirFotoDePerfil(tokenCiudadano());
        mockMvc.perform(get(fotoUrl)).andExpect(status().isUnauthorized());
    }

    @Test
    void otroCiudadanoNoPuedeVerLaFotoAjena_404() throws Exception {
        String fotoUrlDeAna = subirFotoDePerfil(tokenCiudadano());
        String tokenDeOtro = tokenCiudadano();

        // 404 y no 403 a proposito: un 403 confirmaria que ese archivo existe
        // (ver javadoc de PerfilFotoController).
        mockMvc.perform(get(fotoUrlDeAna).header("Authorization", "Bearer " + tokenDeOtro))
                .andExpect(status().isNotFound());
    }

    @Test
    void usuarioSinFoto_404() throws Exception {
        String token = tokenCiudadano();
        mockMvc.perform(get("/api/perfiles/fotos/" + UUID.randomUUID() + ".png")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    /**
     * Path traversal: el endpoint dedicado no puede apoyarse en la proteccion
     * que un resource handler trae de fabrica, asi que hay que comprobarla.
     *
     * <p>La defensa no es sanear la cadena sino no usarla nunca para tocar el
     * disco: el nombre pedido solo se COMPARA contra el que consta en
     * {@code usuario.foto_url}. Ninguna de estas formas coincide con un UUID
     * registrado, asi que ninguna llega al filesystem.</p>
     */
    @Test
    void pathTraversal_noEscapaDelDirectorioDeFotos() throws Exception {
        String token = tokenCiudadano();
        subirFotoDePerfil(token);

        String[] intentos = {
                "..%2F..%2F..%2Fetc%2Fpasswd",
                "..%2F..%2Fapplication.yml",
                "%2E%2E%2F%2E%2E%2Fapplication.yml",
                "....%2F%2F....%2F%2Fetc%2Fpasswd",
        };

        for (String intento : intentos) {
            MvcResult res = mockMvc.perform(get("/api/perfiles/fotos/" + intento)
                            .header("Authorization", "Bearer " + token))
                    .andReturn();

            int status = res.getResponse().getStatus();
            assertThat(status)
                    .as("El intento '%s' no debe devolver contenido", intento)
                    .isNotEqualTo(200);
            assertThat(res.getResponse().getContentAsByteArray())
                    .as("El intento '%s' no debe filtrar bytes de ningun archivo", intento)
                    .isEmpty();
        }
    }
}
