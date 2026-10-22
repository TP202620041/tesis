package pe.edu.upc.viasegura.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.common.exception.GlobalExceptionHandler;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Errores del cliente que respondian 500, y el registro de los 500 (DEP-11).
 *
 * <p>Estas excepciones caian en el {@code Exception.class} de
 * {@code GlobalExceptionHandler}: "el servidor fallo" cuando la peticion era
 * invalida, y en produccion un 500 dispara alertas por un caso normal. Ahora
 * responden 413, 405, 415 y 400 con el mismo {@code ApiError} que el resto, y
 * un 500 de verdad queda registrado en el log.</p>
 *
 * <p>Con servidor real ({@code RANDOM_PORT}) porque el limite de tamano lo
 * aplica Tomcat al leer el multipart, y MockMvc no lo ejecuta. El resto de
 * los casos usa MockMvc sobre el mismo contexto. {@link ControladorDePrueba}
 * existe solo en este contexto: ningun endpoint real tiene una parte
 * obligatoria ni falla a proposito.</p>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(ErroresHttpIT.ControladorDePrueba.class)
class ErroresHttpIT extends AbstractPostgisIT {

    private static final int MB = 1024 * 1024;
    private static final String MENSAJE_413 = "La foto supera el tamaño máximo de 10 MB";

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

    /** Endpoints que solo existen en este IT. */
    @RestController
    @RequestMapping("/api/prueba-errores-http")
    static class ControladorDePrueba {

        @PostMapping(value = "/parte", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
        String conParteObligatoria(@RequestPart("archivo") MultipartFile archivo) {
            return "ok";
        }

        @PostMapping("/fallo")
        String falla(@RequestBody String cuerpo) {
            throw new IllegalStateException("fallo inesperado de prueba");
        }

        /** Lo que lanza el saneado sin turno o el almacenamiento de fotos caido (DEP-12). */
        @PostMapping("/ocupado")
        String ocupado() {
            throw new ServicioNoDisponibleException("Hay muchas fotos procesandose en este momento.");
        }
    }

    private String tokenDeCiudadano() {
        Usuario ciudadano = guardarConTerminos(Usuario.builder()
                .email("errores-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
        return jwtService.generarToken(ciudadano.getEmail(), ciudadano.getRol().name());
    }

    /** Sube una foto de {@code bytesFoto} por HTTP real, en multipart, a {@code ruta}. */
    private HttpResponse<String> subirFoto(String metodo, String ruta, int bytesFoto) throws Exception {
        String limite = "----limite" + UUID.randomUUID();
        ByteArrayOutputStream cuerpo = new ByteArrayOutputStream();
        cuerpo.writeBytes(("--" + limite + "\r\n"
                + "Content-Disposition: form-data; name=\"foto\"; filename=\"grande.jpg\"\r\n"
                + "Content-Type: image/jpeg\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        cuerpo.writeBytes(new byte[bytesFoto]);
        cuerpo.writeBytes(("\r\n--" + limite + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpRequest peticion = HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + ruta))
                .timeout(Duration.ofSeconds(60))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenDeCiudadano())
                .header(HttpHeaders.CONTENT_TYPE, "multipart/form-data; boundary=" + limite)
                .method(metodo, HttpRequest.BodyPublishers.ofByteArray(cuerpo.toByteArray()))
                .build();
        try (HttpClient cliente = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build()) {
            return cliente.send(peticion, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        }
    }

    private void afirmar413(HttpResponse<String> respuesta, String ruta) throws Exception {
        assertThat(respuesta.statusCode()).isEqualTo(413);
        JsonNode cuerpo = objectMapper.readTree(respuesta.body());
        assertThat(cuerpo.get("status").asInt()).isEqualTo(413);
        assertThat(cuerpo.get("error").asText()).isEqualTo("Payload Too Large");
        assertThat(cuerpo.get("message").asText()).isEqualTo(MENSAJE_413);
        assertThat(cuerpo.get("path").asText()).isEqualTo(ruta);
        assertThat(cuerpo.get("timestamp")).isNotNull();
    }

    @Test
    void fotoDeReporteDe11Mb_413ConApiError() throws Exception {
        // Pasa el tope por archivo (10 MB) sin pasar el de la peticion (12 MB).
        afirmar413(subirFoto("POST", "/api/reportes", 11 * MB), "/api/reportes");
    }

    @Test
    void fotoDeReporteDe30Mb_413YNoUnCorteDeConexion() throws Exception {
        // Pasa el tope de la peticion: Tomcat la rechaza sin leerla y, con
        // max-swallow-size en 32 MB, descarta el cuerpo en vez de cortar.
        afirmar413(subirFoto("POST", "/api/reportes", 30 * MB), "/api/reportes");
    }

    @Test
    void fotoDePerfilDe30Mb_413() throws Exception {
        // La foto de perfil no se valida en la PWA: el 413 es lo unico que la frena.
        afirmar413(subirFoto("PATCH", "/api/auth/me", 30 * MB), "/api/auth/me");
    }

    @Test
    void metodoNoAdmitidoEnRutaPublica_405ConAllow() throws Exception {
        // /api/auth/login es publica (cualquier metodo pasa la seguridad) y solo admite POST.
        mockMvc.perform(get("/api/auth/login"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string(HttpHeaders.ALLOW, "POST"))
                .andExpect(jsonPath("$.status").value(405))
                .andExpect(jsonPath("$.error").value("Method Not Allowed"))
                .andExpect(jsonPath("$.message").value("El método GET no está permitido en esta ruta"))
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
                .andExpect(jsonPath("$.message").value("El método PUT no está permitido en esta ruta"));
    }

    @Test
    void jsonAUnaRutaMultipart_415ConAccept() throws Exception {
        mockMvc.perform(post("/api/reportes")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenDeCiudadano())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoriaId\":1}"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(header().string(HttpHeaders.ACCEPT, containsString("multipart/form-data")))
                .andExpect(jsonPath("$.status").value(415))
                .andExpect(jsonPath("$.error").value("Unsupported Media Type"))
                .andExpect(jsonPath("$.message")
                        .value("Tipo de contenido no admitido en esta ruta: se espera multipart/form-data"))
                .andExpect(jsonPath("$.path").value("/api/reportes"))
                .andExpect(jsonPath("$.details").isEmpty());
    }

    @Test
    void jsonAlPatchDelPerfil_415ConAcceptPatch() throws Exception {
        mockMvc.perform(patch("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenDeCiudadano())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nombre\":\"Ana\"}"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(header().string("Accept-Patch", containsString("multipart/form-data")))
                .andExpect(jsonPath("$.status").value(415))
                .andExpect(jsonPath("$.path").value("/api/auth/me"));
    }

    @Test
    void faltaUnParametroDeQuery_400NombrandoElParametro() throws Exception {
        mockMvc.perform(get("/api/distritos/por-coordenadas").param("lat", "-12.12"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Falta el parámetro obligatorio 'lon'"))
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
                .andExpect(jsonPath("$.message").value("Falta el parámetro obligatorio 'categoriaId'"));
    }

    @Test
    void faltaUnaParteObligatoriaDelFormulario_400NombrandoLaParte() throws Exception {
        mockMvc.perform(multipart("/api/prueba-errores-http/parte")
                        .file(new MockMultipartFile("otra", "f.txt", "text/plain", new byte[] {1}))
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenDeCiudadano()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Falta la parte obligatoria 'archivo' del formulario"))
                .andExpect(jsonPath("$.path").value("/api/prueba-errores-http/parte"));
    }

    @Test
    void servicioNoDisponible_503ConSuMensajeYNoUn500() throws Exception {
        // La PWA muestra el mensaje: es una respuesta del servidor, no un
        // error de red, asi que el reporte no queda en la cola offline.
        mockMvc.perform(post("/api/prueba-errores-http/ocupado")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenDeCiudadano()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value(503))
                .andExpect(jsonPath("$.error").value("Service Unavailable"))
                .andExpect(jsonPath("$.message").value("Hay muchas fotos procesandose en este momento."))
                .andExpect(jsonPath("$.path").value("/api/prueba-errores-http/ocupado"));
    }

    @Test
    void errorNoControlado_500ConApiErrorYRegistradoSinElCuerpo() throws Exception {
        String token = tokenDeCiudadano();
        Logger logger = (Logger) LoggerFactory.getLogger(GlobalExceptionHandler.class);
        ListAppender<ILoggingEvent> registro = new ListAppender<>();
        registro.start();
        logger.addAppender(registro);
        try {
            mockMvc.perform(post("/api/prueba-errores-http/fallo")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"password\":\"no-debe-salir-en-el-log\"}"))
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.status").value(500))
                    .andExpect(jsonPath("$.message").value("Error interno del servidor"))
                    .andExpect(jsonPath("$.path").value("/api/prueba-errores-http/fallo"));
        } finally {
            logger.detachAppender(registro);
        }

        List<ILoggingEvent> errores = registro.list.stream().filter(e -> e.getLevel() == Level.ERROR).toList();
        assertThat(errores).hasSize(1);
        ILoggingEvent evento = errores.get(0);
        assertThat(evento.getFormattedMessage())
                .isEqualTo("Error no controlado en POST /api/prueba-errores-http/fallo");
        assertThat(evento.getThrowableProxy()).isNotNull();
        assertThat(evento.getThrowableProxy().getClassName()).isEqualTo(IllegalStateException.class.getName());
        assertThat(evento.getFormattedMessage() + evento.getThrowableProxy().getMessage())
                .doesNotContain("no-debe-salir-en-el-log");
    }
}
