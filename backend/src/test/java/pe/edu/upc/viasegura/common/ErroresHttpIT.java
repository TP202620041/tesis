package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Errores del cliente que respondian 500 (DEP-11).
 *
 * <p>Las tres excepciones caian en el {@code Exception.class} de
 * {@code GlobalExceptionHandler}: "el servidor fallo" cuando la peticion era
 * invalida, y en produccion un 500 dispara alertas por un caso normal. Ahora
 * responden 413, 405 y 400 con el mismo {@code ApiError} que el resto.</p>
 *
 * <p>Con servidor real ({@code RANDOM_PORT}) porque el limite de tamano lo
 * aplica Tomcat al leer el multipart, y MockMvc no lo ejecuta. Los casos de
 * 405 y 400 usan MockMvc sobre el mismo contexto.</p>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ErroresHttpIT extends AbstractPostgisIT {

    private static final int MB = 1024 * 1024;

    @LocalServerPort
    int puerto;
    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;

    private String tokenDeCiudadano() {
        Usuario ciudadano = guardarConTerminos(Usuario.builder()
                .email("errores-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
        return jwtService.generarToken(ciudadano.getEmail(), ciudadano.getRol().name());
    }

    /** {@code POST /api/reportes} multipart, por HTTP real, con una foto de {@code bytesFoto}. */
    private HttpResponse<String> crearReporteConFoto(int bytesFoto) throws Exception {
        String limite = "----limite" + UUID.randomUUID();
        ByteArrayOutputStream cuerpo = new ByteArrayOutputStream();
        cuerpo.writeBytes(("--" + limite + "\r\n"
                + "Content-Disposition: form-data; name=\"categoriaId\"\r\n\r\n1\r\n"
                + "--" + limite + "\r\n"
                + "Content-Disposition: form-data; name=\"foto\"; filename=\"grande.jpg\"\r\n"
                + "Content-Type: image/jpeg\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        cuerpo.writeBytes(new byte[bytesFoto]);
        cuerpo.writeBytes(("\r\n--" + limite + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpRequest peticion = HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + "/api/reportes"))
                .timeout(Duration.ofSeconds(30))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenDeCiudadano())
                .header(HttpHeaders.CONTENT_TYPE, "multipart/form-data; boundary=" + limite)
                .POST(HttpRequest.BodyPublishers.ofByteArray(cuerpo.toByteArray()))
                .build();
        try (HttpClient cliente = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build()) {
            return cliente.send(peticion, HttpResponse.BodyHandlers.ofString());
        }
    }

    @Test
    void fotoDeMasDe10Mb_413ConApiError() throws Exception {
        HttpResponse<String> respuesta = crearReporteConFoto(11 * MB);

        assertThat(respuesta.statusCode()).isEqualTo(413);
        JsonNode cuerpo = objectMapper.readTree(respuesta.body());
        assertThat(cuerpo.get("status").asInt()).isEqualTo(413);
        assertThat(cuerpo.get("error").asText()).isEqualTo("Payload Too Large");
        // Mismo texto que valida la PWA antes de subir (CampoFoto.tsx).
        assertThat(cuerpo.get("message").asText()).isEqualTo("La foto supera 10 MB");
        assertThat(cuerpo.get("path").asText()).isEqualTo("/api/reportes");
        assertThat(cuerpo.get("timestamp")).isNotNull();
    }

    @Test
    void metodoNoAdmitidoEnRutaPublica_405ConAllow() throws Exception {
        // /api/auth/login es publica (cualquier metodo pasa la seguridad) y solo admite POST.
        mockMvc.perform(get("/api/auth/login"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string(HttpHeaders.ALLOW, "POST"))
                .andExpect(jsonPath("$.status").value(405))
                .andExpect(jsonPath("$.error").value("Method Not Allowed"))
                .andExpect(jsonPath("$.message").value("El metodo GET no esta permitido en esta ruta"))
                .andExpect(jsonPath("$.path").value("/api/auth/login"))
                .andExpect(jsonPath("$.details").isEmpty());
    }

    @Test
    void metodoNoAdmitidoConToken_405ConLosMetodosDeLaRuta() throws Exception {
        // /api/reportes/{id} admite GET (detalle), PATCH (editar) y DELETE (cancelar).
        mockMvc.perform(put("/api/reportes/1")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenDeCiudadano())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string(HttpHeaders.ALLOW, containsString("GET")))
                .andExpect(header().string(HttpHeaders.ALLOW, containsString("PATCH")))
                .andExpect(header().string(HttpHeaders.ALLOW, containsString("DELETE")))
                .andExpect(jsonPath("$.status").value(405))
                .andExpect(jsonPath("$.message").value("El metodo PUT no esta permitido en esta ruta"));
    }

    @Test
    void faltaUnParametroDeQuery_400NombrandoElParametro() throws Exception {
        mockMvc.perform(get("/api/distritos/por-coordenadas").param("lat", "-12.12"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Falta el parametro obligatorio 'lon'"))
                .andExpect(jsonPath("$.path").value("/api/distritos/por-coordenadas"))
                .andExpect(jsonPath("$.details").isEmpty());
    }

    @Test
    void faltaUnParametroDelFormulario_400NombrandoElParametro() throws Exception {
        // POST /api/reportes sin categoriaId, que es @RequestParam obligatorio.
        mockMvc.perform(multipart("/api/reportes")
                        .file(new MockMultipartFile("foto", "f.jpg", "image/jpeg", new byte[] {1, 2, 3}))
                        .param("latitud", "-12.12")
                        .param("longitud", "-77.03")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenDeCiudadano()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Falta el parametro obligatorio 'categoriaId'"));
    }
}
