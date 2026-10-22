package pe.edu.upc.viasegura.auth;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import pe.edu.upc.viasegura.auth.domain.Rol;
import pe.edu.upc.viasegura.auth.domain.Usuario;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.security.JwtService;
import pe.edu.upc.viasegura.distritos.domain.Distrito;
import pe.edu.upc.viasegura.distritos.repository.DistritoRepository;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/** Edicion de perfil: nombre, foto y distrito de residencia (US-30). */
class EditarPerfilIT extends AbstractPostgisIT {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    JwtService jwtService;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    UsuarioRepository usuarioRepository;
    @Autowired
    DistritoRepository distritoRepository;

    private Distrito distrito(String nombre) {
        return distritoRepository.findByNombre(nombre)
                .orElseThrow(() -> new IllegalStateException("Falta distrito " + nombre));
    }

    private Usuario ciudadano() {
        return guardarConTerminos(Usuario.builder()
                .email("ciu-" + UUID.randomUUID() + "@lima.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Ana").apellido("Vecina").rol(Rol.CIUDADANO).build());
    }

    private Usuario funcionario() {
        return guardarConTerminos(Usuario.builder()
                .email("func-" + UUID.randomUUID() + "@muni.pe")
                .passwordHash(passwordEncoder.encode("x"))
                .nombre("Fabi").apellido("Municipal").rol(Rol.FUNCIONARIO_MUNICIPAL).build());
    }

    private String token(Usuario u) {
        return jwtService.generarToken(u.getEmail(), u.getRol().name());
    }

    private MockMultipartFile fotoPng() {
        // Una imagen real: desde DEP-12 la foto se decodifica al guardarse.
        return new MockMultipartFile("foto", "perfil.png", "image/png",
                pe.edu.upc.viasegura.support.ImagenesDePrueba.png(8, 8));
    }

    private org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder patchMultipart() {
        return multipart(HttpMethod.PATCH, "/api/auth/me");
    }

    @Test
    void editaNombreYApellido_200() throws Exception {
        Usuario ciu = ciudadano();

        mockMvc.perform(patchMultipart()
                        .param("nombre", "Ana Maria")
                        .param("apellido", "Vecina Rojas")
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nombre", is("Ana Maria")))
                .andExpect(jsonPath("$.apellido", is("Vecina Rojas")));
    }

    @Test
    void editaDistritoDeResidencia_200() throws Exception {
        Usuario ciu = ciudadano();
        Distrito miraflores = distrito("Miraflores");

        mockMvc.perform(patchMultipart()
                        .param("distritoId", miraflores.getId().toString())
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.distritoNombre", is("Miraflores")));
    }

    @Test
    void subeFoto_200_devuelveFotoUrl() throws Exception {
        Usuario ciu = ciudadano();

        mockMvc.perform(patchMultipart()
                        .file(fotoPng())
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fotoUrl", notNullValue()));
    }

    @Test
    void patchParcial_soloCambiaElCampoEnviado() throws Exception {
        Usuario ciu = ciudadano();

        mockMvc.perform(patchMultipart()
                        .param("nombre", "SoloNombre")
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nombre", is("SoloNombre")))
                // El apellido original ("Vecina") no cambio.
                .andExpect(jsonPath("$.apellido", is("Vecina")));
    }

    @Test
    void nombreVacio_400() throws Exception {
        Usuario ciu = ciudadano();

        mockMvc.perform(patchMultipart()
                        .param("nombre", "")
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void distritoInexistente_404() throws Exception {
        Usuario ciu = ciudadano();

        mockMvc.perform(patchMultipart()
                        .param("distritoId", "999999")
                        .header("Authorization", "Bearer " + token(ciu)))
                .andExpect(status().isNotFound());
    }

    @Test
    void funcionarioNoPuedeUsarEsteEndpoint_403() throws Exception {
        // El campo distrito para el funcionario es su jurisdiccion de
        // gestion, no residencia: cambiarlo aqui esta fuera de alcance.
        mockMvc.perform(patchMultipart()
                        .param("nombre", "Intento")
                        .header("Authorization", "Bearer " + token(funcionario())))
                .andExpect(status().isForbidden());
    }

    @Test
    void sinToken_401() throws Exception {
        mockMvc.perform(patchMultipart().param("nombre", "x"))
                .andExpect(status().isUnauthorized());
    }
}
