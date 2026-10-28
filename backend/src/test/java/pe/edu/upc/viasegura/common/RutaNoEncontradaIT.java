package pe.edu.upc.viasegura.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Una ruta inexistente responde 404, no 500.
 *
 * <p>Regresion: la {@code NoResourceFoundException} de Spring MVC caia en el
 * manejador generico {@code Exception.class} de {@code
 * GlobalExceptionHandler}, asi que respondia <b>500</b> — "el servidor
 * fallo" cuando en realidad la peticion era invalida. Se detecto al servir
 * las fotos de reportes (una foto ausente daba error interno) pero afectaba
 * a toda la API.</p>
 */
class RutaNoEncontradaIT extends AbstractPostgisIT {

    @Autowired
    MockMvc mockMvc;

    private String token() throws Exception {
        String correo = "r404-" + UUID.randomUUID() + "@lima.pe";
        mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"secreta123","nombre":"Ana","apellido":"Vecina","aceptaTerminos":true,"versionTerminos":"%s"}
                                """.formatted(correo, versionTerminos)))
                .andExpect(status().isCreated());
        return confirmarEIniciarSesion(correo, "secreta123");
    }

    @Test
    void autenticadoSobreRutaInexistente_404ConCuerpoApiError() throws Exception {
        mockMvc.perform(get("/api/no-existe-este-endpoint").header("Authorization", "Bearer " + token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void rutaPublicaInexistente_404() throws Exception {
        // El subdirectorio publico de fotos: aqui no hay filtro de seguridad
        // que se adelante, asi que se ve el 404 del dispatcher directamente.
        mockMvc.perform(get("/media/fotos/reportes/" + UUID.randomUUID() + ".png"))
                .andExpect(status().isNotFound());
    }

    @Test
    void anonimoSobreRutaInexistenteProtegida_401YNo404() throws Exception {
        // Comportamiento INTENCIONAL, no un defecto: la cadena de seguridad
        // corre antes que el dispatcher, asi que un anonimo recibe 401 sin
        // que el servidor le revele si esa ruta existe o no.
        mockMvc.perform(get("/api/no-existe-este-endpoint"))
                .andExpect(status().isUnauthorized());
    }
}
