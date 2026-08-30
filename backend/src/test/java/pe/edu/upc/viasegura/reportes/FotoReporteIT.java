package pe.edu.upc.viasegura.reportes;

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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import pe.edu.upc.viasegura.reportes.domain.CategoriaDano;
import pe.edu.upc.viasegura.reportes.repository.CategoriaDanoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Las fotos de evidencia de un reporte (US-05) se pueden descargar por la
 * {@code fotoUrl} que devuelve el API, sin autenticacion.
 *
 * <p>Cierra un hueco real: antes las fotos se guardaban pero ninguna ruta las
 * servia, asi que toda {@code fotoUrl} apuntaba a un 401.</p>
 */
class FotoReporteIT extends AbstractPostgisIT {

    // Parque Kennedy, Miraflores.
    private static final double LAT = -12.1215;
    private static final double LON = -77.0297;

    /** PNG valido de 1x1 px. */
    private static final byte[] PNG_1X1 = java.util.Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    CategoriaDanoRepository categoriaRepository;

    private long categoriaEstandarId() {
        return categoriaRepository.findAll().stream()
                .filter(CategoriaDano::isEsEstandar)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("No hay categorias estandar sembradas"))
                .getId();
    }

    private String tokenCiudadano() throws Exception {
        MvcResult res = mockMvc.perform(post("/api/auth/registro")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"foto-%s@lima.pe","password":"secreta123","nombre":"Ana","apellido":"Vecina"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("token").asText();
    }

    /** Crea un reporte con foto y devuelve la `fotoUrl` que entrega el API. */
    private String crearReporteConFoto() throws Exception {
        MvcResult res = mockMvc.perform(multipart("/api/reportes")
                        .file(new MockMultipartFile("foto", "bache.png", "image/png", PNG_1X1))
                        .param("latitud", String.valueOf(LAT))
                        .param("longitud", String.valueOf(LON))
                        .param("categoriaId", String.valueOf(categoriaEstandarId()))
                        .header("Authorization", "Bearer " + tokenCiudadano()))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("fotoUrl").asText();
    }

    @Test
    void laFotoUrlDevueltaSePuedeDescargarSinToken() throws Exception {
        String fotoUrl = crearReporteConFoto();

        // La URL debe apuntar al subdirectorio publico, no al de perfiles.
        assertThat(fotoUrl).startsWith("/media/fotos/reportes/");

        MvcResult descarga = mockMvc.perform(get(fotoUrl))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andReturn();

        // No basta con el 200: el cuerpo debe ser exactamente la foto subida.
        assertThat(descarga.getResponse().getContentAsByteArray()).isEqualTo(PNG_1X1);
    }

    @Test
    void unaFotoInexistente_devuelve404NoUn401() throws Exception {
        // Confirma que la ruta esta realmente abierta: si siguiera protegida,
        // esto responderia 401 en vez de 404.
        mockMvc.perform(get("/media/fotos/reportes/" + UUID.randomUUID() + ".png"))
                .andExpect(status().isNotFound());
    }

    @Test
    void elDirectorioDeFotosDePerfilNoSeSirveComoEstatico() throws Exception {
        // Solo se abrio /media/fotos/reportes/**. Las fotos de perfil viven en
        // /media/fotos/perfiles y solo salen por el endpoint que valida al
        // dueno; servirlas aqui las expondria a cualquiera.
        mockMvc.perform(get("/media/fotos/perfiles/" + UUID.randomUUID() + ".png"))
                .andExpect(status().isUnauthorized());
    }
}
