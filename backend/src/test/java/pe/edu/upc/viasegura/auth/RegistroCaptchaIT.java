package pe.edu.upc.viasegura.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.edu.upc.viasegura.auth.port.VerificadorDeCaptcha;
import pe.edu.upc.viasegura.auth.repository.UsuarioRepository;
import pe.edu.upc.viasegura.common.exception.BusinessException;
import pe.edu.upc.viasegura.common.exception.ServicioNoDisponibleException;
import pe.edu.upc.viasegura.support.AbstractPostgisIT;

/**
 * Registro con el captcha activo (NC-08), con un {@link VerificadorDeCaptcha}
 * simulado que lo exige: la suite nunca llama a Google (el adaptador real lo
 * prueba {@code RecaptchaV2AdapterTest}).
 *
 * <p>Lo que importa aqui es el orden: el captcha se comprueba antes que el
 * correo duplicado (si no, el registro serviria para enumerar correos sin
 * resolver el captcha) y, si falla, no se crea nada.</p>
 */
class RegistroCaptchaIT extends AbstractPostgisIT {

    private static final String MENSAJE_RECHAZADO =
            "No pudimos confirmar que no eres un robot. Vuelve a intentarlo.";

    @Autowired
    MockMvc mockMvc;
    @Autowired
    UsuarioRepository usuarioRepository;

    @MockitoBean
    VerificadorDeCaptcha verificadorDeCaptcha;

    @BeforeEach
    void exigirCaptcha() {
        when(verificadorDeCaptcha.exigido()).thenReturn(true);
    }

    private static String email() {
        return "captcha-" + UUID.randomUUID() + "@lima.pe";
    }

    private ResultActions registrar(String email, String captchaToken) throws Exception {
        String token = captchaToken == null ? "null" : "\"" + captchaToken + "\"";
        return mockMvc.perform(post("/api/auth/registro")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"secreta123","nombre":"Ana","apellido":"Ruiz",\
                        "aceptaTerminos":true,"versionTerminos":"%s","captchaToken":%s}
                        """.formatted(email, versionTerminos, token)));
    }

    @Test
    void sinToken_409YNoCreaElUsuario() throws Exception {
        String correo = email();

        registrar(correo, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is("Confirma que no eres un robot")));
        registrar(correo, "   ")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is("Confirma que no eres un robot")));

        assertThat(usuarioRepository.existsByEmail(correo)).isFalse();
        verify(verificadorDeCaptcha, never()).verificar(anyString());
    }

    @Test
    void tokenRechazado_409YNoCreaElUsuario() throws Exception {
        String correo = email();
        doThrow(new BusinessException(MENSAJE_RECHAZADO)).when(verificadorDeCaptcha).verificar("rechazado");

        registrar(correo, "rechazado")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is(MENSAJE_RECHAZADO)));

        assertThat(usuarioRepository.existsByEmail(correo)).isFalse();
    }

    @Test
    void correoYaRegistradoYTokenRechazado_elMensajeEsElDelCaptcha() throws Exception {
        String correo = email();
        registrar(correo, "valido").andExpect(status().isCreated());
        doThrow(new BusinessException(MENSAJE_RECHAZADO)).when(verificadorDeCaptcha).verificar("rechazado");

        // Sin captcha valido no se revela que el correo ya tiene cuenta.
        registrar(correo, "rechazado")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is(MENSAJE_RECHAZADO)));
        registrar(correo, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is("Confirma que no eres un robot")));
    }

    @Test
    void googleNoDisponible_503YNoCreaElUsuario() throws Exception {
        String correo = email();
        doThrow(new ServicioNoDisponibleException("No pudimos verificar el captcha en este momento."))
                .when(verificadorDeCaptcha).verificar("cualquiera");

        registrar(correo, "cualquiera")
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status", is(503)));

        assertThat(usuarioRepository.existsByEmail(correo)).isFalse();
    }

    @Test
    void tokenValido_201YElVerificadorRecibioEseToken() throws Exception {
        String correo = email();

        registrar(correo, "token-valido-de-la-casilla")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email", is(correo)));

        verify(verificadorDeCaptcha).verificar("token-valido-de-la-casilla");
        assertThat(usuarioRepository.existsByEmail(correo)).isTrue();
    }

    @Test
    void tokenRechazadoYCorreoDesechable_elMensajeEsElDelCaptcha() throws Exception {
        // NC-09: el captcha va antes que la verificacion del dominio del correo.
        String correo = "captcha-" + UUID.randomUUID() + "@mailinator.com";
        doThrow(new BusinessException(MENSAJE_RECHAZADO)).when(verificadorDeCaptcha).verificar("rechazado");

        registrar(correo, "rechazado")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", is(MENSAJE_RECHAZADO)));
        assertThat(usuarioRepository.existsByEmail(correo)).isFalse();
    }

    @Test
    void unTokenDemasiadoLargo_400() throws Exception {
        registrar(email(), "x".repeat(2049)).andExpect(status().isBadRequest());

        verify(verificadorDeCaptcha, never()).verificar(anyString());
    }
}
